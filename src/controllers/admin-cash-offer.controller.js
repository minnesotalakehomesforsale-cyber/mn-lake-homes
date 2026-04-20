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
