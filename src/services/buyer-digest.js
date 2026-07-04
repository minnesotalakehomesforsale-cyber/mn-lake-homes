// buyer-digest.js — weekly "new homes on your saved lakes" email.
// Complements the instant per-listing alerts with a habit-forming weekly
// roundup. Each user is throttled to ~once a week via users.last_digest_at.
const pool = require('../database/pool');
const emailService = require('../services/email');
const { matches, describe } = require('../controllers/search.controller');

const SITE_URL = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
const money = n => (n != null ? '$' + Number(n).toLocaleString('en-US') : 'Contact for price');
const thumb = u => (typeof u === 'string' && u.includes('/upload/')) ? u.replace('/upload/', '/upload/w_500,h_300,c_fill,q_auto,f_auto/') : u;

async function runWeeklyDigest() {
    if (process.env.BUYER_DIGEST_ENABLED === 'false') return { sent: 0 };
    if (process.env.LISTINGS_PUBLIC === 'false') return { sent: 0 };
    try {
        // New active listings from the last 7 days (the digest's candidate pool).
        const { rows: fresh } = await pool.query(`
            SELECT id, slug, title, price, city, beds, baths, water_body, address,
                   property_type, waterfront, featured_image_url, status
              FROM listings
             WHERE status='active' AND created_at >= NOW() - INTERVAL '7 days'`);
        if (!fresh.length) return { sent: 0 };

        // Users with saved searches who haven't been digested in ~a week.
        const { rows: users } = await pool.query(`
            SELECT u.id, u.email, u.first_name,
                   json_agg(json_build_object('name', s.name, 'criteria', s.criteria)) AS searches
              FROM users u JOIN saved_searches s ON s.user_id = u.id
             WHERE u.email IS NOT NULL
               AND (u.last_digest_at IS NULL OR u.last_digest_at < NOW() - INTERVAL '6 days')
             GROUP BY u.id`);

        let sent = 0;
        for (const u of users) {
            const searches = (u.searches || []).filter(Boolean);
            const seen = new Set();
            const hits = [];
            for (const l of fresh) {
                if (searches.some(s => matches(l, s.criteria || {}))) {
                    if (!seen.has(l.id)) { seen.add(l.id); hits.push(l); }
                }
            }
            // Always advance the throttle so we don't re-scan the same user daily.
            await pool.query(`UPDATE users SET last_digest_at = NOW() WHERE id = $1`, [u.id]).catch(() => {});
            if (!hits.length) continue;

            const cards = hits.slice(0, 6).map(l => `
                <a href="${SITE_URL}/listings/${l.slug}" style="text-decoration:none;color:inherit;display:block;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:0.8rem;">
                    ${l.featured_image_url ? `<img src="${thumb(l.featured_image_url)}" alt="" style="width:100%;display:block;">` : ''}
                    <div style="padding:0.8rem 1rem;">
                        <div style="font-size:1.2rem;font-weight:800;color:#1a202c;">${money(l.price)}</div>
                        <div style="font-weight:700;color:#2d3748;">${escapeHtml(l.title)}</div>
                        <div style="color:#718096;font-size:0.88rem;margin-top:0.15rem;">${[l.beds != null ? l.beds + ' bd' : '', l.baths != null ? l.baths + ' ba' : '', escapeHtml(l.city || '')].filter(Boolean).join(' · ')}</div>
                    </div>
                </a>`).join('');
            emailService.sendEmail({
                to: u.email,
                subject: `${hits.length} new lake home${hits.length === 1 ? '' : 's'} matching your searches`,
                html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;color:#1a202c;">
                    <h2 style="margin:0 0 0.3rem;">Hi ${escapeHtml(u.first_name || 'there')}, here's what's new this week</h2>
                    <p style="color:#718096;margin:0 0 1.1rem;">${hits.length} new home${hits.length === 1 ? '' : 's'} matched your saved searches.</p>
                    ${cards}
                    <p style="text-align:center;margin:1.2rem 0 0.4rem;"><a href="${SITE_URL}/properties" style="background:#1d6df2;color:#fff;text-decoration:none;font-weight:700;padding:0.7rem 1.4rem;border-radius:10px;display:inline-block;">Browse all lake homes →</a></p>
                    <p style="font-size:0.72rem;color:#a0aec0;text-align:center;margin-top:1.1rem;">Manage your alerts from your MN Lake Homes dashboard.</p>
                </div>`,
            });
            sent++;
        }
        if (sent) console.log(`[buyer-digest] sent ${sent} weekly digest(s)`);
        return { sent };
    } catch (e) { console.warn('[buyer-digest] failed:', e.message); return { sent: 0, error: e.message }; }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

module.exports = { runWeeklyDigest };
