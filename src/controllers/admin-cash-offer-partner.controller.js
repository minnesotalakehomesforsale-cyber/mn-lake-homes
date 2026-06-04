/**
 * admin-cash-offer-partner.controller.js — CRUD for cash_offer_partners.
 *
 * Mounted under /api/admin/cash-offer-partners with verifyToken +
 * requireRole(['admin','super_admin']).
 *
 *   GET    /        → list (non-archived)
 *   POST   /        → create (+ HubSpot contact upsert + "Cash Offer
 *                     Partner" tag note)
 *   PATCH  /:id     → update (+ HubSpot patch when contact already mirrored)
 *   DELETE /:id     → soft archive
 *
 * The HubSpot mirror is fire-and-forget so a flaky HubSpot never blocks
 * the local write — failures log to console and leave hs_contact_id
 * NULL so a later edit can retry.
 */

const pool = require('../database/pool');
const hubspot = require('../services/hubspot');
const { logActivity } = require('../services/activity-log');

const CASH_OFFER_PARTNER_TAG = 'Cash Offer Partner';

function splitName(full) {
    const s = String(full || '').trim();
    if (!s) return { first: '', last: '' };
    const parts = s.split(/\s+/);
    return { first: parts[0], last: parts.slice(1).join(' ') };
}

// Fire-and-forget HubSpot upsert + tag note. Resolves to hs_contact_id
// on success, null on skip/fail.
async function syncPartnerToHubSpot({ email, name, phone, company, isFirstSync }) {
    if (!email) return null;
    const { first, last } = splitName(name);
    const res = await hubspot.syncContact({
        email,
        firstname: first,
        lastname:  last,
        phone:     phone || undefined,
        company:   company || undefined,
        jobtitle:  CASH_OFFER_PARTNER_TAG, // marks them as a partner
    });
    if (!res?.id) return null;
    if (isFirstSync) {
        await hubspot.createContactNote(
            res.id,
            `<p><strong>${CASH_OFFER_PARTNER_TAG}</strong></p>` +
            `<p>Added from the MN Lake Homes admin as a cash-offer partner. ` +
            `Inbound cash-offer leads can be forwarded to this contact.</p>`
        ).catch(() => null);
    }
    return res.id;
}

// ─── GET /api/admin/cash-offer-partners ────────────────────────────────────
exports.list = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT p.id, p.name, p.email, p.phone, p.company, p.notes,
                   p.hs_contact_id, p.created_at, p.updated_at,
                   COALESCE(s.send_count, 0)::int AS send_count,
                   s.last_sent_at
              FROM cash_offer_partners p
              LEFT JOIN (
                  SELECT partner_id,
                         COUNT(*) AS send_count,
                         MAX(sent_at) AS last_sent_at
                    FROM cash_offer_sends
                   GROUP BY partner_id
              ) s ON s.partner_id = p.id
             WHERE p.archived_at IS NULL
             ORDER BY p.name ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[cash-offer-partner] list failed:', err.message);
        res.status(500).json({ error: 'Failed to list partners.' });
    }
};

// ─── POST /api/admin/cash-offer-partners ───────────────────────────────────
exports.create = async (req, res) => {
    const body = req.body || {};
    const name    = String(body.name    || '').trim();
    const email   = String(body.email   || '').trim().toLowerCase();
    const phone   = String(body.phone   || '').trim() || null;
    const company = String(body.company || '').trim() || null;
    const notes   = String(body.notes   || '').trim() || null;
    if (!name)  return res.status(400).json({ error: 'name is required.' });
    if (!email) return res.status(400).json({ error: 'email is required.' });

    let partner;
    try {
        // Use the lower(email) unique index for upsert. If an archived row
        // exists with this email we revive it (clear archived_at) and refresh
        // its fields — admins shouldn't have to dig through archives.
        const { rows } = await pool.query(`
            INSERT INTO cash_offer_partners (name, email, phone, company, notes)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT ON CONSTRAINT cash_offer_partners_pkey DO NOTHING
            RETURNING *
        `, [name, email, phone, company, notes]).catch(async (err) => {
            // Duplicate email — fall back to UPDATE so the create acts as upsert.
            if (err && err.code === '23505') {
                return pool.query(`
                    UPDATE cash_offer_partners
                       SET name = $1, phone = $2, company = $3, notes = $4,
                           archived_at = NULL, updated_at = NOW()
                     WHERE lower(email) = lower($5)
                     RETURNING *
                `, [name, phone, company, notes, email]);
            }
            throw err;
        });
        partner = rows[0];
        if (!partner) return res.status(500).json({ error: 'Insert returned no row.' });

        // HubSpot sync — fire-and-forget so a flaky API never blocks.
        (async () => {
            try {
                const hsId = await syncPartnerToHubSpot({
                    email, name, phone, company,
                    isFirstSync: !partner.hs_contact_id,
                });
                if (hsId && hsId !== partner.hs_contact_id) {
                    await pool.query(
                        `UPDATE cash_offer_partners SET hs_contact_id = $1, updated_at = NOW() WHERE id = $2`,
                        [hsId, partner.id]
                    );
                }
            } catch (err) {
                console.error('[cash-offer-partner.create] hubspot sync failed:', err.message);
            }
        })();

        logActivity({
            event_type: 'cash_offer_partner.create',
            event_scope: 'cash_offer',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'cash_offer_partner', id: partner.id, label: partner.name },
            req,
        });

        res.status(201).json({ partner });
    } catch (err) {
        console.error('[cash-offer-partner] create failed:', err.message);
        res.status(500).json({ error: 'Failed to create partner.' });
    }
};

// ─── PATCH /api/admin/cash-offer-partners/:id ──────────────────────────────
exports.patch = async (req, res) => {
    const { id } = req.params;
    const b = req.body || {};
    const fields = [];
    const vals = [];
    let i = 1;
    function push(col, val) { fields.push(`${col} = $${i++}`); vals.push(val); }

    if ('name'    in b) push('name',    String(b.name    || '').trim());
    if ('email'   in b) push('email',   String(b.email   || '').trim().toLowerCase());
    if ('phone'   in b) push('phone',   String(b.phone   || '').trim() || null);
    if ('company' in b) push('company', String(b.company || '').trim() || null);
    if ('notes'   in b) push('notes',   String(b.notes   || '').trim() || null);

    if (!fields.length) return res.json({ success: true, noop: true });

    fields.push(`updated_at = NOW()`);
    vals.push(id);

    try {
        const { rowCount, rows } = await pool.query(
            `UPDATE cash_offer_partners SET ${fields.join(', ')} WHERE id = $${i} AND archived_at IS NULL RETURNING *`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Partner not found.' });
        const partner = rows[0];

        // HubSpot mirror — patch if we already have an id, else upsert.
        (async () => {
            try {
                if (partner.hs_contact_id) {
                    const { first, last } = splitName(partner.name);
                    await hubspot.updateContact(partner.hs_contact_id, {
                        firstname: first,
                        lastname:  last,
                        phone:     partner.phone || undefined,
                        company:   partner.company || undefined,
                        jobtitle:  CASH_OFFER_PARTNER_TAG,
                    });
                } else if (partner.email) {
                    const hsId = await syncPartnerToHubSpot({
                        email:   partner.email,
                        name:    partner.name,
                        phone:   partner.phone,
                        company: partner.company,
                        isFirstSync: true,
                    });
                    if (hsId) {
                        await pool.query(
                            `UPDATE cash_offer_partners SET hs_contact_id = $1 WHERE id = $2`,
                            [hsId, partner.id]
                        );
                    }
                }
            } catch (err) {
                console.error('[cash-offer-partner.patch] hubspot sync failed:', err.message);
            }
        })();

        logActivity({
            event_type: 'cash_offer_partner.update',
            event_scope: 'cash_offer',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'cash_offer_partner', id: partner.id, label: partner.name },
            req,
        });

        res.json({ partner });
    } catch (err) {
        console.error('[cash-offer-partner] patch failed:', err.message);
        res.status(500).json({ error: 'Failed to update partner.' });
    }
};

// ─── DELETE /api/admin/cash-offer-partners/:id ─────────────────────────────
// Soft archive — preserves send history and the HubSpot contact. To truly
// purge, the admin can delete in HubSpot manually; we leave that authority
// over there since the contact may have other meaning to them.
exports.remove = async (req, res) => {
    try {
        const { rowCount, rows } = await pool.query(
            `UPDATE cash_offer_partners SET archived_at = NOW(), updated_at = NOW()
              WHERE id = $1 AND archived_at IS NULL
              RETURNING id, name`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Partner not found.' });
        logActivity({
            event_type: 'cash_offer_partner.archive',
            event_scope: 'cash_offer',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'cash_offer_partner', id: rows[0].id, label: rows[0].name },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[cash-offer-partner] remove failed:', err.message);
        res.status(500).json({ error: 'Failed to archive partner.' });
    }
};
