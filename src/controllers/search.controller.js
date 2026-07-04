// Saved searches + price alerts.
// A signed-in buyer stores criteria; when a NEW listing goes active (or an
// existing one drops in price into range), matching users get an email. It's
// event-driven — notifyListing() is called from the listing controller, so no
// cron is required. A per (search, listing) hit row dedupes so nobody is
// emailed about the same home twice.
const pool = require('../database/pool');
const emailService = require('../services/email');

const SITE_URL = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
const numOrNull = v => (v === '' || v === null || v === undefined ? null : Number(v));

// Normalize an incoming criteria payload into the small, known shape we store.
function cleanCriteria(b = {}) {
    return {
        q:             (String(b.q ?? '').trim().slice(0, 120) || null),
        min_price:     numOrNull(b.min_price),
        max_price:     numOrNull(b.max_price),
        min_beds:      numOrNull(b.min_beds),
        property_type: (String(b.property_type ?? '').trim().slice(0, 48) || null),
        waterfront:    (b.waterfront === true || b.waterfront === 'yes' || b.waterfront === 'true') ? true : null,
    };
}

function describe(c) {
    const parts = [];
    if (c.q) parts.push(`"${c.q}"`);
    if (c.property_type) parts.push(c.property_type);
    if (c.min_beds != null) parts.push(`${c.min_beds}+ bd`);
    if (c.waterfront) parts.push('waterfront');
    if (c.min_price != null || c.max_price != null) {
        const lo = c.min_price != null ? '$' + Number(c.min_price).toLocaleString('en-US') : '';
        const hi = c.max_price != null ? '$' + Number(c.max_price).toLocaleString('en-US') : '';
        parts.push(lo && hi ? `${lo}–${hi}` : lo ? `${lo}+` : `under ${hi}`);
    }
    return parts.join(' · ') || 'All lake homes';
}

// Does a listing row satisfy a criteria object?
function matches(l, c) {
    if (!l || l.status !== 'active') return false;
    if (c.min_price != null && (l.price == null || l.price < c.min_price)) return false;
    if (c.max_price != null && (l.price == null || l.price > c.max_price)) return false;
    if (c.min_beds != null && (l.beds == null || l.beds < c.min_beds)) return false;
    if (c.property_type && l.property_type !== c.property_type) return false;
    if (c.waterfront === true && l.waterfront !== true) return false;
    if (c.q) {
        const hay = [l.title, l.city, l.water_body, l.address].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(String(c.q).toLowerCase())) return false;
    }
    return true;
}

// ── Buyer-facing CRUD ───────────────────────────────────────────────────────
exports.createSearch = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'Sign in to save a search.' });
        const criteria = cleanCriteria(req.body || {});
        const name = String(req.body?.name ?? '').trim().slice(0, 120) || describe(criteria);
        const { rows } = await pool.query(
            `INSERT INTO saved_searches (user_id, name, criteria) VALUES ($1, $2, $3::jsonb)
             RETURNING id, name, criteria, created_at`,
            [userId, name, JSON.stringify(criteria)]);
        res.status(201).json({ success: true, search: rows[0] });
    } catch (e) { console.error('[search.create]', e.message); res.status(500).json({ error: 'Could not save your search.' }); }
};

exports.listMine = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'Sign in required.' });
        const { rows } = await pool.query(
            `SELECT id, name, criteria, created_at FROM saved_searches
              WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
        res.json(rows.map(r => ({ ...r, summary: describe(r.criteria || {}) })));
    } catch (e) { console.error('[search.listMine]', e.message); res.status(500).json({ error: 'Could not load your searches.' }); }
};

exports.removeSearch = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'Sign in required.' });
        const { rowCount } = await pool.query(
            `DELETE FROM saved_searches WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
        if (!rowCount) return res.status(404).json({ error: 'Search not found.' });
        res.json({ success: true });
    } catch (e) { console.error('[search.remove]', e.message); res.status(500).json({ error: 'Could not delete.' }); }
};

// ── Notification (called from the listing controller) ───────────────────────
// reason: 'new' | 'price_drop'. Fire-and-forget; never throws to the caller.
async function notifyListing(listingId, reason = 'new') {
    if (process.env.LISTINGS_PUBLIC === 'false') return;
    try {
        const { rows: lr } = await pool.query(
            `SELECT id, slug, title, price, city, beds, baths, water_body, address,
                    property_type, waterfront, featured_image_url, status
               FROM listings WHERE id = $1 LIMIT 1`, [listingId]);
        const l = lr[0];
        if (!l || l.status !== 'active') return;

        const { rows: searches } = await pool.query(
            `SELECT s.id, s.name, s.criteria, u.email, u.first_name
               FROM saved_searches s JOIN users u ON u.id = s.user_id
              WHERE u.email IS NOT NULL`);

        const priceStr = l.price != null ? '$' + Number(l.price).toLocaleString('en-US') : 'Contact for price';
        const img = (l.featured_image_url && l.featured_image_url.includes('/upload/'))
            ? l.featured_image_url.replace('/upload/', '/upload/w_600,h_360,c_fill,q_auto,f_auto/')
            : l.featured_image_url;
        const url = `${SITE_URL}/listings/${l.slug}`;

        for (const s of searches) {
            const c = s.criteria || {};
            if (!matches(l, c)) continue;
            // Dedupe: one email per (search, listing).
            const ins = await pool.query(
                `INSERT INTO saved_search_hits (search_id, listing_id) VALUES ($1, $2)
                 ON CONFLICT (search_id, listing_id) DO NOTHING`, [s.id, l.id]);
            if (!ins.rowCount) continue;

            const heading = reason === 'price_drop' ? 'Price drop on a home you might like' : 'New home matching your saved search';
            const html = `
                <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;">
                    <p style="font-size:0.85rem;color:#718096;margin:0 0 0.25rem;">${heading}</p>
                    <h2 style="margin:0 0 1rem;color:#1a202c;">${escapeHtml(s.name)}</h2>
                    <a href="${url}" style="text-decoration:none;color:inherit;display:block;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                        ${img ? `<img src="${escapeHtml(img)}" alt="" style="width:100%;display:block;">` : ''}
                        <div style="padding:1rem 1.15rem;">
                            <div style="font-size:1.5rem;font-weight:800;color:#1a202c;">${priceStr}</div>
                            <div style="font-weight:700;color:#2d3748;margin-top:0.15rem;">${escapeHtml(l.title)}</div>
                            <div style="color:#718096;font-size:0.9rem;margin-top:0.2rem;">${[l.beds != null ? l.beds + ' bd' : '', l.baths != null ? l.baths + ' ba' : '', escapeHtml(l.city || '')].filter(Boolean).join(' · ')}</div>
                        </div>
                    </a>
                    <p style="text-align:center;margin:1.25rem 0 0.5rem;">
                        <a href="${url}" style="background:#1d6df2;color:#fff;text-decoration:none;font-weight:700;padding:0.7rem 1.4rem;border-radius:10px;display:inline-block;">View this home →</a>
                    </p>
                    <p style="font-size:0.75rem;color:#a0aec0;text-align:center;margin-top:1.25rem;">You saved this search on MinnesotaLakeHomesForSale.com. Manage or remove your alerts from your dashboard.</p>
                </div>`;
            emailService.sendEmail({
                to: s.email,
                subject: reason === 'price_drop' ? `Price drop: ${l.title} — ${priceStr}` : `New match: ${l.title} — ${priceStr}`,
                html,
            });
        }
    } catch (e) { console.warn('[search.notifyListing] failed:', e.message); }
}
exports.notifyListing = notifyListing;
exports.matches = matches;
exports.describe = describe;

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
