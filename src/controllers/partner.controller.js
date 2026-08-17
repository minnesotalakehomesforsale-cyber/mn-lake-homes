// Partner Perks — admin CRUD for the vendor network (companies + tiered offers +
// contacts + notes + contract files) and the agent-facing, tier-gated offer
// feed. Distinct from the Buyer Partners (cash_offer_partners). See
// src/services/... tables partner_companies / partner_offers / partner_contacts /
// partner_notes / partner_files.
const pool = require('../database/pool');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { logActivity } = require('../services/activity-log');

// Offer tiers are DATA-DRIVEN from the memberships table (the source of truth for
// an agent's plan), never hardcoded — so the admin dropdown always reflects the
// real tiers and gating matches what agents actually have. Ordered lowest tier
// first (highest sort_priority). getTiers exposes them to the admin UI.
async function membershipTiers() {
    const { rows } = await pool.query(`SELECT code, name, sort_priority FROM memberships ORDER BY sort_priority DESC`);
    return rows;   // [{ code, name, sort_priority }] — lowest tier first
}
const slugify = s => String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200) || 'partner';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// GET /api/admin/partner-perks/tiers — the real membership tiers (lowest first),
// so the offer form's "Available to" dropdown reflects actual plans, not a
// hardcoded guess. Each offer gates cumulatively: an agent unlocks it when their
// tier is at least the offer's min_tier (by sort_priority).
const getTiers = async (req, res) => {
    try { res.json(await membershipTiers()); }
    catch (e) { console.error('[partners.tiers]', e.message); res.status(500).json({ error: 'Failed to load tiers.' }); }
};

// ── Companies ────────────────────────────────────────────────────────────────
const listCompanies = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.*,
                    (SELECT COUNT(*) FROM partner_offers o WHERE o.partner_id = c.id AND o.is_active)::int AS offer_count
               FROM partner_companies c
              ORDER BY c.sort_order ASC, c.company_name ASC`);
        res.json(rows);
    } catch (e) { console.error('[partners.list]', e.message); res.status(500).json({ error: 'Failed to load partners.' }); }
};

const getCompany = async (req, res) => {
    try {
        const c = (await pool.query(`SELECT * FROM partner_companies WHERE id = $1::uuid`, [req.params.id])).rows[0];
        if (!c) return res.status(404).json({ error: 'Partner not found.' });
        const [offers, contacts, notes, files] = await Promise.all([
            pool.query(`SELECT o.*, m.name AS min_tier_name FROM partner_offers o LEFT JOIN memberships m ON m.code = o.min_tier WHERE o.partner_id = $1::uuid ORDER BY o.sort_order, o.created_at`, [c.id]),
            pool.query(`SELECT * FROM partner_contacts WHERE partner_id = $1::uuid ORDER BY created_at`, [c.id]),
            pool.query(`SELECT n.*, u.full_name AS author FROM partner_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.partner_id = $1::uuid ORDER BY n.created_at DESC`, [c.id]),
            pool.query(`SELECT * FROM partner_files WHERE partner_id = $1::uuid ORDER BY created_at DESC`, [c.id]),
        ]);
        res.json({ ...c, offers: offers.rows, contacts: contacts.rows, notes: notes.rows, files: files.rows });
    } catch (e) { console.error('[partners.get]', e.message); res.status(500).json({ error: 'Failed to load partner.' }); }
};

const createCompany = async (req, res) => {
    const { company_name, category, website_url, logo_url, summary, status } = req.body || {};
    if (!company_name || !company_name.trim()) return res.status(400).json({ error: 'Company name is required.' });
    try {
        let slug = slugify(company_name);
        if ((await pool.query(`SELECT 1 FROM partner_companies WHERE slug = $1`, [slug])).rowCount) {
            slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
        }
        const r = await pool.query(
            `INSERT INTO partner_companies (company_name, slug, category, website_url, logo_url, summary, status)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'active')) RETURNING *`,
            [company_name.trim(), slug, category || null, website_url || null, logo_url || null, summary || null, status || null]);
        logActivity({ event_type: 'partner.create', event_scope: 'partner', actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' }, target: { type: 'partner', id: r.rows[0].id, label: company_name }, req });
        res.json(r.rows[0]);
    } catch (e) { console.error('[partners.create]', e.message); res.status(500).json({ error: 'Failed to create partner.' }); }
};

const updateCompany = async (req, res) => {
    const allowed = ['company_name', 'category', 'website_url', 'logo_url', 'summary', 'status', 'sort_order'];
    const sets = [], vals = [];
    for (const k of allowed) if (k in (req.body || {})) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    sets.push('updated_at = NOW()'); vals.push(req.params.id);
    try {
        const r = await pool.query(`UPDATE partner_companies SET ${sets.join(', ')} WHERE id = $${vals.length}::uuid RETURNING *`, vals);
        if (!r.rowCount) return res.status(404).json({ error: 'Partner not found.' });
        res.json(r.rows[0]);
    } catch (e) { console.error('[partners.update]', e.message); res.status(500).json({ error: 'Failed to update partner.' }); }
};

const deleteCompany = async (req, res) => {
    try { await pool.query(`DELETE FROM partner_companies WHERE id = $1::uuid`, [req.params.id]); res.json({ success: true }); }
    catch (e) { console.error('[partners.delete]', e.message); res.status(500).json({ error: 'Failed to delete partner.' }); }
};

// ── Offers ───────────────────────────────────────────────────────────────────
const createOffer = async (req, res) => {
    const { title, value_text, min_tier, redeem_type, redeem_link, redeem_instructions } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Offer title is required.' });
    const tiers = await membershipTiers();
    const codes = new Set(tiers.map(t => t.code));
    const tier = codes.has(min_tier) ? min_tier : (tiers[0]?.code || 'free');   // default = lowest tier (all agents)
    try {
        const r = await pool.query(
            `INSERT INTO partner_offers (partner_id, title, value_text, min_tier, redeem_type, redeem_link, redeem_instructions)
             VALUES ($1::uuid, $2, $3, $4, COALESCE($5, 'request'), $6, $7) RETURNING *`,
            [req.params.id, title.trim(), value_text || null, tier, redeem_type || null, redeem_link || null, redeem_instructions || null]);
        res.json(r.rows[0]);
    } catch (e) { console.error('[offers.create]', e.message); res.status(500).json({ error: 'Failed to create offer.' }); }
};

const updateOffer = async (req, res) => {
    const allowed = ['title', 'value_text', 'min_tier', 'redeem_type', 'redeem_link', 'redeem_instructions', 'is_active', 'sort_order'];
    let validCodes = null;
    if ('min_tier' in (req.body || {})) validCodes = new Set((await membershipTiers()).map(t => t.code));
    const sets = [], vals = [];
    for (const k of allowed) if (k in (req.body || {})) {
        let v = req.body[k];
        if (k === 'min_tier' && validCodes && !validCodes.has(v)) v = 'free';
        vals.push(v); sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    sets.push('updated_at = NOW()'); vals.push(req.params.offerId);
    try {
        const r = await pool.query(`UPDATE partner_offers SET ${sets.join(', ')} WHERE id = $${vals.length}::uuid RETURNING *`, vals);
        if (!r.rowCount) return res.status(404).json({ error: 'Offer not found.' });
        res.json(r.rows[0]);
    } catch (e) { console.error('[offers.update]', e.message); res.status(500).json({ error: 'Failed to update offer.' }); }
};

const deleteOffer = async (req, res) => {
    try { await pool.query(`DELETE FROM partner_offers WHERE id = $1::uuid`, [req.params.offerId]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Failed to delete offer.' }); }
};

// ── Contacts ─────────────────────────────────────────────────────────────────
const addContact = async (req, res) => {
    const { name, role, email, phone, notes } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Contact name is required.' });
    try {
        const r = await pool.query(`INSERT INTO partner_contacts (partner_id, name, role, email, phone, notes) VALUES ($1::uuid, $2, $3, $4, $5, $6) RETURNING *`,
            [req.params.id, name.trim(), role || null, email || null, phone || null, notes || null]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Failed to add contact.' }); }
};
const deleteContact = async (req, res) => {
    try { await pool.query(`DELETE FROM partner_contacts WHERE id = $1::uuid`, [req.params.contactId]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Failed to delete contact.' }); }
};

// ── Notes ────────────────────────────────────────────────────────────────────
const addNote = async (req, res) => {
    const { note_body } = req.body || {};
    if (!note_body || !note_body.trim()) return res.status(400).json({ error: 'Note is empty.' });
    try {
        const r = await pool.query(`INSERT INTO partner_notes (partner_id, user_id, note_body) VALUES ($1::uuid, $2, $3) RETURNING *`,
            [req.params.id, req.user?.userId || null, note_body.trim()]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Failed to add note.' }); }
};
const deleteNote = async (req, res) => {
    try { await pool.query(`DELETE FROM partner_notes WHERE id = $1::uuid`, [req.params.noteId]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Failed to delete note.' }); }
};

// ── Files (contracts) — Cloudinary raw/auto upload ───────────────────────────
const uploadFile = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });
    try {
        const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        const up = await cloudinary.uploader.upload(dataUri, { resource_type: 'auto', folder: 'partner-contracts' });
        const r = await pool.query(
            `INSERT INTO partner_files (partner_id, file_url, file_name, file_type, uploaded_by) VALUES ($1::uuid, $2, $3, $4, $5) RETURNING *`,
            [req.params.id, up.secure_url, req.file.originalname, req.file.mimetype, req.user?.userId || null]);
        res.json(r.rows[0]);
    } catch (e) { console.error('[partner.upload]', e.message); res.status(500).json({ error: 'Upload failed.' }); }
};
const deleteFile = async (req, res) => {
    try { await pool.query(`DELETE FROM partner_files WHERE id = $1::uuid`, [req.params.fileId]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Failed to delete file.' }); }
};

// ── Agent-facing: tier-gated offer feed ──────────────────────────────────────
// Every active offer is returned; each is flagged unlocked/locked for the
// signed-in agent's tier. Locked offers reveal WHAT the perk is but withhold the
// redeem link/instructions — the UI shows an Upgrade button instead.
const agentPerks = async (req, res) => {
    try {
        const me = (await pool.query(
            `SELECT COALESCE(m.sort_priority, 400) AS my_priority, COALESCE(m.code, 'free') AS my_code
               FROM agents a LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE a.user_id = $1 LIMIT 1`, [req.user.userId])).rows[0] || { my_priority: 400, my_code: 'free' };
        const { rows } = await pool.query(
            `SELECT o.id, o.title, o.value_text, o.min_tier, o.redeem_type, o.redeem_link, o.redeem_instructions,
                    tierm.sort_priority AS min_priority, tierm.name AS min_tier_name,
                    c.company_name, c.category, c.website_url, c.logo_url, c.summary
               FROM partner_offers o
               JOIN partner_companies c ON c.id = o.partner_id AND c.status = 'active'
               LEFT JOIN memberships tierm ON tierm.code = o.min_tier
              WHERE o.is_active = TRUE
              ORDER BY c.sort_order, c.company_name, o.sort_order`);
        // Lower sort_priority = higher tier; an agent unlocks an offer when their
        // tier is at least the offer's minimum.
        const offers = rows.map(o => {
            const unlocked = Number(me.my_priority) <= Number(o.min_priority ?? 400);
            return {
                ...o,
                unlocked,
                redeem_link:         unlocked ? o.redeem_link : null,
                redeem_instructions: unlocked ? o.redeem_instructions : null,
            };
        });
        res.json({ my_tier: me.my_code, offers });
    } catch (e) { console.error('[agentPerks]', e.message); res.status(500).json({ error: 'Failed to load perks.' }); }
};

module.exports = {
    getTiers,
    listCompanies, getCompany, createCompany, updateCompany, deleteCompany,
    createOffer, updateOffer, deleteOffer,
    addContact, deleteContact, addNote, deleteNote,
    fileUpload, uploadFile, deleteFile,
    agentPerks,
};
