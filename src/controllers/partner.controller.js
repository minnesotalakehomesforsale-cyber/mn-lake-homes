// partner.controller.js — buyer-side service partners (lenders, inspectors,
// insurance, title, marine) + referral routing. A buyer requests a service on
// a listing; we route to the best active partner in that category (priority,
// then round-robin by last_referred_at) and email everyone. The platform earns
// a referral fee per hand-off.
const pool = require('../database/pool');
const emailService = require('../services/email');
const { logActivity } = require('../services/activity-log');

const CATEGORIES = {
    lender:     { label: 'Mortgage pre-approval', verb: 'get pre-approved' },
    inspection: { label: 'Home inspection',       verb: 'schedule an inspection' },
    insurance:  { label: 'Home insurance quote',  verb: 'get an insurance quote' },
    title:      { label: 'Title & closing',       verb: 'connect with a title company' },
    marine:     { label: 'Dock & marine',         verb: 'connect with a dock/marine pro' },
};
const isAdmin = (req) => ['admin', 'super_admin'].includes(req.user?.role);
const str = (v, n) => (String(v ?? '').trim().slice(0, n) || null);

// GET /api/partners?category= — active partners (public, for display).
exports.listPublic = async (req, res) => {
    try {
        const cat = str(req.query.category, 24);
        const params = [];
        let where = 'active = TRUE';
        if (cat) { params.push(cat); where += ` AND category = $1`; }
        const { rows } = await pool.query(
            `SELECT id, category, name, website_url, blurb
               FROM service_partners WHERE ${where}
              ORDER BY priority DESC, name ASC`, params);
        res.json(rows);
    } catch (e) { console.error('[partners.listPublic]', e.message); res.status(500).json({ error: 'Failed to load partners.' }); }
};

// POST /api/partners/refer — a buyer requests a service. Routes to a partner
// (if any) and notifies partner + buyer + admin. Works even with zero partners
// configured (admin still gets the request to handle manually).
exports.refer = async (req, res) => {
    try {
        const category = str(req.body?.category, 24);
        if (!category || !CATEGORIES[category]) return res.status(400).json({ error: 'Unknown service.' });
        const name = str(req.body?.name, 200);
        const email = str(req.body?.email, 255);
        const phone = str(req.body?.phone, 50);
        const message = str(req.body?.message, 2000);
        const listingId = str(req.body?.listing_id, 64);
        if (!name || (!email && !phone)) return res.status(400).json({ error: 'Name and an email or phone are required.' });

        // Pick a partner: highest priority, least-recently referred (round-robin).
        const pr = await pool.query(
            `SELECT id, name, contact_email FROM service_partners
              WHERE active = TRUE AND category = $1
              ORDER BY priority DESC, last_referred_at ASC NULLS FIRST, created_at ASC
              LIMIT 1`, [category]);
        const partner = pr.rows[0] || null;

        const ins = await pool.query(
            `INSERT INTO partner_referrals (category, partner_id, name, email, phone, message, listing_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [category, partner?.id || null, name, email, phone, message,
             (listingId && /^[0-9a-f-]{36}$/i.test(listingId)) ? listingId : null]);
        if (partner) {
            pool.query(`UPDATE service_partners SET last_referred_at = NOW() WHERE id = $1`, [partner.id]).catch(() => {});
        }

        const catLabel = CATEGORIES[category].label;
        // Notify the partner (if we have one with an email).
        if (partner?.contact_email) {
            emailService.sendEmail({
                to: partner.contact_email,
                subject: `New ${catLabel} referral from MN Lake Homes`,
                html: `<p>You have a new <b>${catLabel}</b> referral:</p>
                       <p><b>${escapeHtml(name)}</b><br>${email ? 'Email: ' + escapeHtml(email) + '<br>' : ''}${phone ? 'Phone: ' + escapeHtml(phone) : ''}</p>
                       ${message ? `<p>${escapeHtml(message)}</p>` : ''}<p>Please reach out promptly.</p>`,
            });
        }
        // Confirm to the buyer.
        if (email) {
            emailService.sendEmail({
                to: email,
                subject: `Your ${catLabel} request — MN Lake Homes`,
                html: `<p>Thanks ${escapeHtml((name || '').split(' ')[0] || 'there')} — we've received your request to ${CATEGORIES[category].verb}.</p>
                       <p>${partner ? `We've connected you with <b>${escapeHtml(partner.name)}</b>, who will reach out shortly.` : 'A trusted local partner will reach out shortly.'}</p>`,
            });
        }
        // Always tell admin.
        emailService.sendEmail({
            to: process.env.ADMIN_EMAIL || process.env.LEAD_NOTIFY_EMAIL || 'hburnside99@gmail.com',
            subject: `Referral: ${catLabel} — ${name}`,
            html: `<p>New buyer-service referral (<b>${catLabel}</b>)${partner ? ` routed to <b>${escapeHtml(partner.name)}</b>` : ' — <b>no partner configured</b>, handle manually'}.</p>
                   <p><b>${escapeHtml(name)}</b><br>${email ? escapeHtml(email) + '<br>' : ''}${phone ? escapeHtml(phone) : ''}</p>
                   ${message ? `<p>${escapeHtml(message)}</p>` : ''}`,
        });
        logActivity({
            event_type: 'partner.referral', event_scope: 'partner',
            actor: { type: 'public', label: email || phone || name },
            target: { type: 'partner_referral', id: ins.rows[0].id, label: catLabel },
            details: { category, partner_id: partner?.id || null }, req,
        });
        res.status(201).json({ success: true });
    } catch (e) { console.error('[partners.refer]', e.message); res.status(500).json({ error: 'Could not submit your request.' }); }
};

// ── Admin ───────────────────────────────────────────────────────────────────
exports.listAdmin = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rows } = await pool.query(`SELECT * FROM service_partners ORDER BY category, priority DESC, name`);
        res.json(rows);
    } catch (e) { console.error('[partners.listAdmin]', e.message); res.status(500).json({ error: 'Failed to load.' }); }
};
exports.saveAdmin = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const b = req.body || {};
    const category = str(b.category, 24);
    if (!category || !CATEGORIES[category]) return res.status(400).json({ error: 'Pick a valid category.' });
    const vals = [category, str(b.name, 160), str(b.contact_email, 255), str(b.contact_phone, 50),
                  str(b.website_url, 500), str(b.blurb, 1000),
                  b.active === false ? false : true, Number(b.priority) || 0];
    if (!vals[1]) return res.status(400).json({ error: 'Name is required.' });
    try {
        if (b.id) {
            await pool.query(
                `UPDATE service_partners SET category=$1, name=$2, contact_email=$3, contact_phone=$4,
                        website_url=$5, blurb=$6, active=$7, priority=$8 WHERE id=$9`,
                [...vals, b.id]);
            return res.json({ success: true, id: b.id });
        }
        const { rows } = await pool.query(
            `INSERT INTO service_partners (category, name, contact_email, contact_phone, website_url, blurb, active, priority)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, vals);
        res.status(201).json({ success: true, id: rows[0].id });
    } catch (e) { console.error('[partners.saveAdmin]', e.message); res.status(500).json({ error: 'Could not save.' }); }
};
exports.removeAdmin = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        await pool.query(`DELETE FROM service_partners WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (e) { console.error('[partners.removeAdmin]', e.message); res.status(500).json({ error: 'Could not delete.' }); }
};
exports.referralsAdmin = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rows } = await pool.query(
            `SELECT r.*, p.name AS partner_name FROM partner_referrals r
               LEFT JOIN service_partners p ON p.id = r.partner_id
              ORDER BY r.created_at DESC LIMIT 200`);
        res.json(rows);
    } catch (e) { console.error('[partners.referralsAdmin]', e.message); res.status(500).json({ error: 'Failed to load.' }); }
};

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
