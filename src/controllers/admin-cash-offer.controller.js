/**
 * admin-cash-offer.controller.js — Admin endpoints for cash-offer lead management.
 *
 * Mounted under /api/admin/cash-offers with verifyToken + requireRole(['admin','super_admin']).
 *
 *   GET    /                 → list
 *   GET    /new-count        → badge count (status='new' AND archived_at IS NULL)
 *   GET    /:id              → single lead detail w/ JSON payloads
 *   PATCH  /:id              → update status and/or admin_notes
 */

const pool = require('../database/pool');
const { logActivity } = require('../services/activity-log');
const emailSvc = require('../services/email');
const hubspot  = require('../services/hubspot');

const VALID_STATUSES = new Set([
    'new',
    'viewed',
    'contacted',
    'proceeding_cash',
    'chose_agent',
    'archived',
]);

// ─── GET /api/admin/cash-offers ────────────────────────────────────────────
exports.list = async (req, res) => {
    try {
        const statusFilter = (req.query.status || '').trim();
        const params = [];
        let where = `WHERE archived_at IS NULL`;
        if (statusFilter) {
            params.push(statusFilter);
            where = `WHERE status = $${params.length} AND archived_at IS NULL`;
        }

        const sql = `
            SELECT
                id,
                created_at,
                updated_at,
                status,
                full_name,
                email,
                phone,
                address_raw,
                place_id,
                beds,
                baths,
                sqft,
                year_built,
                lot_size,
                condition,
                last_sale_date,
                last_sale_price,
                avm,
                offer_amount,
                offer_generated_at,
                user_selection,
                selection_made_at,
                admin_notes,
                source_site
            FROM cash_offer_leads
            ${where}
            ORDER BY created_at DESC
        `;
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('[cash-offer] admin list failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch cash-offer leads.' });
    }
};

// ─── GET /api/admin/cash-offers/new-count ──────────────────────────────────
exports.newCount = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count
               FROM cash_offer_leads
              WHERE status = 'new' AND archived_at IS NULL`
        );
        res.json({ count: rows[0].count });
    } catch (err) {
        console.error('[cash-offer] newCount failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch new count.' });
    }
};

// ─── GET /api/admin/cash-offers/:id ────────────────────────────────────────
// Per spec §8: opening the detail view auto-transitions status='new' → 'viewed'
// so the sidebar badge count decrements as admins triage.
exports.detail = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM cash_offer_leads WHERE id = $1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Lead not found.' });

        const lead = rows[0];
        if (lead.status === 'new') {
            await pool.query(
                `UPDATE cash_offer_leads SET status = 'viewed', updated_at = NOW() WHERE id = $1`,
                [req.params.id]
            );
            lead.status = 'viewed';
        }
        res.json(lead);
    } catch (err) {
        console.error('[cash-offer] admin detail failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch lead.' });
    }
};

// ─── PATCH /api/admin/cash-offers/:id ──────────────────────────────────────
exports.patch = async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    try {
        // Pull current state so we can detect a 'new' → anything transition.
        const { rows: currentRows } = await pool.query(
            `SELECT status FROM cash_offer_leads WHERE id = $1`,
            [id]
        );
        if (!currentRows.length) return res.status(404).json({ error: 'Lead not found.' });
        const prevStatus = currentRows[0].status;

        const fields = [];
        const vals = [];
        let i = 1;

        if ('status' in body) {
            const nextStatus = String(body.status || '').trim();
            if (!VALID_STATUSES.has(nextStatus)) {
                return res.status(400).json({ error: `Invalid status. Allowed: ${[...VALID_STATUSES].join(', ')}` });
            }
            fields.push(`status = $${i++}`);
            vals.push(nextStatus);

            if (nextStatus === 'archived') {
                fields.push(`archived_at = NOW()`);
            }
        }

        if ('admin_notes' in body) {
            const notes = body.admin_notes === null || body.admin_notes === ''
                ? null
                : String(body.admin_notes).slice(0, 5000);
            fields.push(`admin_notes = $${i++}`);
            vals.push(notes);
        }

        if (!fields.length) {
            return res.json({ success: true, noop: true });
        }

        fields.push(`updated_at = NOW()`);
        vals.push(id);

        const { rowCount, rows } = await pool.query(
            `UPDATE cash_offer_leads
                SET ${fields.join(', ')}
              WHERE id = $${i}
              RETURNING *`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Lead not found.' });

        const lead = rows[0];

        // Record the 'view' — any transition from 'new' counts.
        const viewed = prevStatus === 'new' && lead.status !== 'new';

        logActivity({
            event_type: 'cash_offer.admin_update',
            event_scope: 'cash_offer',
            actor: {
                type: 'user',
                id:   req.user?.userId,
                label: req.user?.email || req.user?.role || 'admin',
            },
            target: { type: 'cash_offer_lead', id: lead.id, label: `${lead.full_name || ''} · ${lead.address_raw || ''}`.trim() },
            details: {
                from_status: prevStatus,
                to_status:   lead.status,
                notes_changed: 'admin_notes' in body,
                viewed,
            },
            req,
        });

        res.json({ success: true, lead });
    } catch (err) {
        console.error('[cash-offer] admin patch failed:', err.message);
        res.status(500).json({ error: 'Failed to update lead.' });
    }
};

// ─── GET /api/admin/cash-offers/:id/sends ──────────────────────────────────
// Send history for the timeline view in the drawer.
exports.listSends = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT s.id, s.partner_id, s.subject, s.message, s.sent_at,
                   p.name AS partner_name, p.email AS partner_email,
                   p.company AS partner_company
              FROM cash_offer_sends s
              JOIN cash_offer_partners p ON p.id = s.partner_id
             WHERE s.offer_id = $1
             ORDER BY s.sent_at DESC
        `, [req.params.id]);
        res.json(rows);
    } catch (err) {
        console.error('[cash-offer] listSends failed:', err.message);
        res.status(500).json({ error: 'Failed to load send history.' });
    }
};

// ─── POST /api/admin/cash-offers/:id/send ──────────────────────────────────
// Forward a cash-offer lead to one of our partners. The compose UI lets
// the admin override subject + custom message; the seller contact +
// property facts + offer amount are baked into the body server-side from
// the cash_offer_leads row so they can't drift. We log the send to
// cash_offer_sends + the activity log + a HubSpot note on the partner's
// contact (so HubSpot reflects the outreach too).
exports.sendToPartner = async (req, res) => {
    const offerId = req.params.id;
    const body    = req.body || {};
    const partnerId = String(body.partnerId || '').trim();
    const customMessage = String(body.customMessage || '').trim();
    const overrideSubject = String(body.subject || '').trim();

    if (!partnerId) return res.status(400).json({ error: 'partnerId is required.' });

    try {
        const { rows: oRows } = await pool.query(
            `SELECT * FROM cash_offer_leads WHERE id = $1`, [offerId]
        );
        if (!oRows.length) return res.status(404).json({ error: 'Cash offer not found.' });
        const offer = oRows[0];

        const { rows: pRows } = await pool.query(
            `SELECT id, name, email, phone, company, hs_contact_id
               FROM cash_offer_partners
              WHERE id = $1 AND archived_at IS NULL`,
            [partnerId]
        );
        if (!pRows.length) return res.status(404).json({ error: 'Partner not found.' });
        const partner = pRows[0];
        if (!partner.email) return res.status(400).json({ error: 'Partner has no email on file.' });

        // Resolve the admin's email + display name so the partner's reply
        // lands in their inbox (replyTo) and the email body uses their name.
        // JWT only carries userId/role, so we do a quick lookup.
        let adminEmail = null, adminName = 'MN Lake Homes';
        if (req.user?.userId) {
            const { rows: uRows } = await pool.query(
                `SELECT email, full_name FROM users WHERE id = $1`,
                [req.user.userId]
            );
            if (uRows.length) {
                adminEmail = uRows[0].email || null;
                adminName  = uRows[0].full_name || adminEmail || adminName;
            }
        }

        // Send the email synchronously so the admin sees a success/failure
        // immediately. Email transports can swallow errors quietly so we
        // surface a sane fallback message either way.
        const subject = overrideSubject ||
            `Cash offer lead — ${offer.address_raw || offer.full_name || 'new property'}`;

        const sendResult = await emailSvc.sendCashOfferToPartner({
            to: partner.email,
            partnerName: partner.name,
            customMessage,
            offer: {
                full_name:        offer.full_name,
                email:            offer.email,
                phone:            offer.phone,
                address_raw:      offer.address_raw,
                beds:             offer.beds,
                baths:            offer.baths,
                sqft:             offer.sqft,
                year_built:       offer.year_built,
                lot_size:         offer.lot_size,
                condition:        offer.condition,
                offer_amount:     offer.offer_amount,
                avm:              offer.avm,
                last_sale_price:  offer.last_sale_price,
                property:         offer.property_data_json || {},
            },
            fromName:  adminName,
            fromEmail: adminEmail,
        });
        if (sendResult?.skipped) {
            return res.status(500).json({ error: 'Email transport rejected the message.' });
        }

        // Record the send. The message column stores the admin's custom
        // note (not the full HTML body) so it stays readable in the
        // timeline.
        const { rows: sRows } = await pool.query(`
            INSERT INTO cash_offer_sends (offer_id, partner_id, sent_by_user_id, subject, message)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, sent_at
        `, [offerId, partnerId, req.user?.userId || null, subject, customMessage || null]);
        const sendId = sRows[0].id;

        // HubSpot notes — fire-and-forget. One on the partner's contact
        // timeline, one on the cash-offer's contact timeline (if mirrored).
        (async () => {
            try {
                const noteBody = `
                    <p><strong>Cash offer forwarded</strong></p>
                    <p>Subject: ${subject}</p>
                    <p>Property: ${offer.address_raw || '—'}</p>
                    <p>Offer: $${Number(offer.offer_amount || 0).toLocaleString('en-US')}</p>
                    ${customMessage ? `<p><em>${customMessage.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</em></p>` : ''}
                `.trim();

                const targets = [];
                if (partner.hs_contact_id) targets.push(partner.hs_contact_id);
                if (offer.hs_contact_id)   targets.push(offer.hs_contact_id);

                const noteIds = [];
                for (const hsId of targets) {
                    const r = await hubspot.createContactNote(hsId, noteBody);
                    if (r?.id) noteIds.push(r.id);
                }
                if (noteIds.length) {
                    await pool.query(
                        `UPDATE cash_offer_sends SET hs_note_id = $1 WHERE id = $2`,
                        [noteIds.join(','), sendId]
                    );
                }
            } catch (err) {
                console.error('[cash-offer.sendToPartner] hubspot mirror failed:', err.message);
            }
        })();

        logActivity({
            event_type: 'cash_offer.sent_to_partner',
            event_scope: 'cash_offer',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'cash_offer_lead', id: offerId, label: `${offer.full_name || ''} · ${offer.address_raw || ''}`.trim() },
            details: { partner_id: partnerId, partner_name: partner.name, subject },
            req,
        });

        res.json({ success: true, send_id: sendId });
    } catch (err) {
        console.error('[cash-offer] sendToPartner failed:', err.message);
        res.status(500).json({ error: 'Failed to send offer to partner.' });
    }
};

// DELETE /api/admin/cash-offers/:id — hard delete. Nothing FKs to
// cash_offer_leads, so a plain DELETE fully removes it. Distinct from
// the archive action (PATCH status=archived), which is reversible.
// Route already enforces verifyToken + admin role.
exports.remove = async (req, res) => {
    try {
        const { rowCount, rows } = await pool.query(
            `DELETE FROM cash_offer_leads WHERE id = $1
             RETURNING id, full_name, address_raw`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Cash offer lead not found.' });
        logActivity({
            event_type: 'cash_offer.delete',
            event_scope: 'cash_offer',
            severity: 'warning',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role || 'admin' },
            target: { type: 'cash_offer_lead', id: rows[0].id, label: `${rows[0].full_name || ''} · ${rows[0].address_raw || ''}`.trim() },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[cash-offer] admin delete failed:', err.message);
        res.status(500).json({ error: 'Failed to delete cash offer lead.' });
    }
};
