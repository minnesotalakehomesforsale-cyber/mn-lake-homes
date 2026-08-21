// claim.controller.js — DEV-10: free-tier self-claim for unclaimed agent /
// business listings. Flow: start (email + Turnstile) → email a verification
// link → verify (grants edit rights scoped to that ONE record, lands it in the
// admin approval queue, never public until approved). Claim events sync to
// HubSpot as outreach triggers. Free tier is genuinely free — no card, no trial.
const crypto  = require('crypto');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const pool    = require('../database/pool');
const emailService = require('../services/email');
const hubspot = require('../services/hubspot');
const { verifyTurnstile } = require('../middleware/spam-guard');
const { logActivity } = require('../services/activity-log');
const { SECURE_COOKIES } = require('../config/security');

const SITE = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setCookie(res, token) {
    res.cookie('auth_session', token, { httpOnly: true, secure: SECURE_COOKIES, sameSite: 'strict', maxAge: 86_400_000 });
}
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;

// Resolve the record + whether it's currently unclaimed (user_id IS NULL).
async function loadTarget(type, id) {
    if (type === 'agent') {
        const r = await pool.query(`SELECT id, user_id, display_name AS name, slug FROM agents WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [id]);
        return r.rows[0] || null;
    }
    if (type === 'business') {
        const r = await pool.query(`SELECT id, user_id, name, slug FROM businesses WHERE id = $1 LIMIT 1`, [id]);
        return r.rows[0] || null;
    }
    return null;
}

// Best-effort HubSpot claim event (outreach trigger). Never throws.
async function hubspotClaimEvent(email, name, stage, detail) {
    try {
        if (!hubspot.isActive || !hubspot.isActive()) return;
        const r = await hubspot.syncContact({ email, firstname: (name || '').split(' ')[0], lastname: (name || '').split(' ').slice(1).join(' '), lifecyclestage: 'lead', signup_source: 'self_claim' });
        if (r && r.id) await hubspot.createContactNote(r.id, `Self-claim: ${stage} — ${detail}`);
    } catch (e) { console.warn('[claim] hubspot event failed:', e.message); }
}

// DEV-10: fire the "profile published" HubSpot event (3rd claim event / outreach
// trigger) when a CLAIMED record is approved + goes public. Best-effort, and only
// once per claim (flips it verified → approved). Call from the admin publish path.
async function firePublishedEvent(type, id) {
    try {
        const cr = await pool.query(
            `SELECT email FROM record_claims WHERE target_type = $1 AND target_id = $2 AND status = 'verified' ORDER BY verified_at DESC LIMIT 1`, [type, id]);
        if (!cr.rows[0]) return;
        await pool.query(`UPDATE record_claims SET status = 'approved' WHERE target_type = $1 AND target_id = $2 AND status = 'verified'`, [type, id]);
        await hubspotClaimEvent(cr.rows[0].email, null, 'profile_published', `${type}:${id}`);
    } catch (e) { console.warn('[claim] published event failed:', e.message); }
}
exports.firePublishedEvent = firePublishedEvent;

// ─── POST /api/claim/start ───────────────────────────────────────────────────
exports.start = async (req, res) => {
    try {
        const b = req.body || {};
        const target_type = String(b.target_type || '').toLowerCase();
        const target_id   = String(b.target_id || '').trim();
        const email       = String(b.email || '').trim().toLowerCase();

        if (!['agent', 'business'].includes(target_type)) return res.status(400).json({ error: 'Invalid listing type.' });
        if (!target_id) return res.status(400).json({ error: 'Missing listing.' });
        if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

        // Turnstile (skipped only when TURNSTILE_SECRET is unset).
        const human = await verifyTurnstile(b.turnstile_token, clientIp(req));
        if (!human) return res.status(400).json({ error: 'Verification failed — please try again.' });

        const target = await loadTarget(target_type, target_id);
        // Uniform response whether or not it's claimable, to prevent probing which
        // listings are owned. Only actually send the email when it's claimable.
        const generic = { ok: true, message: `If ${target_type === 'agent' ? 'that profile' : 'that listing'} can be claimed, we've emailed a verification link to ${email}.` };
        if (!target || target.user_id) return res.json(generic);

        // One active pending claim per record+email; refresh its token.
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query(
            `INSERT INTO record_claims (target_type, target_id, email, token, created_ip)
             VALUES ($1, $2, $3, $4, $5)`,
            [target_type, target_id, email, token, clientIp(req)]);

        const link = `${SITE}/api/claim/verify?token=${token}`;
        await emailService.sendEmail({
            to: email,
            subject: `Confirm your claim of ${target.name || 'your listing'}`,
            category: 'transactional',
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;line-height:1.6;color:#1a202c;">
                <h2 style="font-weight:800;">Claim ${target.name || 'your listing'}</h2>
                <p>Confirm this email to claim and edit your free listing on MinnesotaLakeHomesForSale.com. Your profile stays private until our team reviews it.</p>
                <p style="margin:1.5rem 0;"><a href="${link}" style="background:#1d6df2;color:#fff;padding:0.85rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;">Confirm &amp; claim my listing →</a></p>
                <p style="font-size:0.85rem;color:#718096;">This link expires in 48 hours. Free to claim — no card required. If you didn't request this, ignore this email.</p>
            </div>`,
        });

        hubspotClaimEvent(email, target.name, 'initiated', `${target_type}:${target.slug || target_id}`);
        logActivity({ event_type: 'claim.initiated', event_scope: target_type, actor: { type: 'public', label: email }, target: { type: target_type, id: target_id, label: target.name }, req });
        res.json(generic);
    } catch (err) {
        console.error('[claim.start]', err.message);
        res.status(500).json({ error: 'Could not start the claim. Please try again.' });
    }
};

// ─── GET /api/claim/verify?token= ────────────────────────────────────────────
exports.verify = async (req, res) => {
    const client = await pool.connect();
    try {
        const token = String(req.query.token || '').trim();
        const done = (ok, msg) => res.redirect(`/claim-result?ok=${ok ? 1 : 0}&m=${encodeURIComponent(msg)}`);
        if (!token) return done(false, 'Missing token.');

        await client.query('BEGIN');
        const cr = await client.query(`SELECT * FROM record_claims WHERE token = $1 FOR UPDATE`, [token]);
        const claim = cr.rows[0];
        if (!claim)                        { await client.query('ROLLBACK'); return done(false, 'This link is invalid.'); }
        if (claim.status !== 'pending')    { await client.query('ROLLBACK'); return done(false, 'This link was already used.'); }
        if (new Date(claim.expires_at) < new Date()) {
            await client.query(`UPDATE record_claims SET status = 'expired' WHERE id = $1`, [claim.id]);
            await client.query('COMMIT'); return done(false, 'This link has expired — start the claim again.');
        }

        // Re-check the record is STILL unclaimed (race guard) INSIDE the tx.
        const isAgent = claim.target_type === 'agent';
        const recTable = isAgent ? 'agents' : 'businesses';
        const rec = await client.query(`SELECT id, user_id, ${isAgent ? 'display_name' : 'name'} AS name FROM ${recTable} WHERE id = $1 FOR UPDATE`, [claim.target_id]);
        if (!rec.rows[0]) { await client.query('ROLLBACK'); return done(false, 'That listing no longer exists.'); }
        if (rec.rows[0].user_id) { await client.query(`UPDATE record_claims SET status = 'rejected' WHERE id = $1`, [claim.id]); await client.query('COMMIT'); return done(false, 'That listing has already been claimed.'); }

        // Find or create the owner account for this verified email.
        const email = claim.email.toLowerCase();
        let userRes = await client.query(`SELECT id, role FROM users WHERE lower(email) = $1 LIMIT 1`, [email]);
        let userId, role = isAgent ? 'agent' : 'business_owner';
        if (userRes.rows[0]) {
            userId = userRes.rows[0].id; role = userRes.rows[0].role;
        } else {
            const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);  // random; user sets a real one later
            const nm = rec.rows[0].name || email.split('@')[0];
            const ins = await client.query(
                `INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status, password_changed_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW()) RETURNING id`,
                [nm.split(' ')[0], nm.split(' ').slice(1).join(' '), nm, email, hash, role]);
            userId = ins.rows[0].id;
        }

        // Link the record to the account (scoped edit rights) + park it in the
        // approval queue — NEVER public until an admin approves.
        if (isAgent) {
            await client.query(`UPDATE agents SET user_id = $1, profile_status = 'pending_review', is_published = FALSE, updated_at = NOW() WHERE id = $2`, [userId, claim.target_id]);
        } else {
            await client.query(`UPDATE businesses SET user_id = $1, status = 'pending', updated_at = NOW() WHERE id = $2`, [userId, claim.target_id]);
        }
        await client.query(`UPDATE record_claims SET status = 'verified', user_id = $1, verified_at = NOW() WHERE id = $2`, [userId, claim.id]);
        await client.query('COMMIT');

        // Log them in (email verification IS the auth) so they can edit right away.
        const tok = jwt.sign({ userId, role, pwd_iat: Math.floor(Date.now() / 1000) }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setCookie(res, tok);

        hubspotClaimEvent(email, rec.rows[0].name, 'email_verified', `${claim.target_type}:${claim.target_id}`);
        logActivity({ event_type: 'claim.verified', event_scope: claim.target_type, actor: { type: 'user', id: userId, label: email }, target: { type: claim.target_type, id: claim.target_id, label: rec.rows[0].name } });
        return done(true, isAgent ? 'Claimed! Finish your profile, then submit for review.' : 'Claimed! Finish your listing, then submit for review.');
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('[claim.verify]', err.message);
        res.redirect('/claim-result?ok=0&m=' + encodeURIComponent('Something went wrong. Please try again.'));
    } finally {
        client.release();
    }
};
