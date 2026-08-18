'use strict';

// Onboarding nudge — email agents whose profile is still DRAFT/unpublished to
// finish it and go live. New agents who sign up but never publish are dead
// inventory: buyers can't find them and they're not in the lead rotation. This
// sweep finds them and sends a "finish your profile" email that names exactly
// what's missing (photo, bio, service areas).
//
// Self-throttling so it never spams:
//   • MIN_AGE_HOURS — give them time before the first nudge
//   • RESEND_DAYS   — spacing between nudges
//   • MAX_NUDGES    — hard cap per agent
// Runs on a timer from server boot; idempotent + best-effort.

const pool = require('../database/pool');
const email = require('./email');
const sms = require('./sms');

const MAX_NUDGES = 3;
const MIN_AGE_HOURS = 48;
const RESEND_DAYS = 4;

async function runProfileCompletionNudge() {
    let sent = 0;
    try {
        const { rows } = await pool.query(
            `SELECT a.id, a.display_name, a.bio, a.profile_photo_url, a.service_areas,
                    a.profile_nudge_count, u.first_name, u.email
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE a.is_published = FALSE
                AND a.profile_status = 'draft'
                AND a.deleted_at IS NULL
                AND COALESCE(u.email, '') <> ''
                AND a.created_at < NOW() - ($1 || ' hours')::interval
                AND a.profile_nudge_count < $2
                AND (a.last_profile_nudge_at IS NULL OR a.last_profile_nudge_at < NOW() - ($3 || ' days')::interval)
              ORDER BY a.created_at ASC
              LIMIT 100`,
            [String(MIN_AGE_HOURS), MAX_NUDGES, String(RESEND_DAYS)]);

        for (const a of rows) {
            // Name what's missing so the email is actionable, not generic.
            const missing = [];
            if (!a.profile_photo_url) missing.push('A profile photo');
            if (!a.bio || String(a.bio).trim().length < 40) missing.push('A short bio');
            let areas = a.service_areas;
            if (!Array.isArray(areas)) { try { areas = JSON.parse(areas || '[]'); } catch (_) { areas = []; } }
            if (!areas.length) missing.push('The lakes and towns you serve');

            try {
                email.sendAgentProfileNudge({
                    to: a.email,
                    first_name: a.first_name || String(a.display_name || '').split(' ')[0],
                    missing,
                    nudgeNumber: (a.profile_nudge_count || 0) + 1,
                });
                await pool.query(
                    `UPDATE agents SET last_profile_nudge_at = NOW(), profile_nudge_count = profile_nudge_count + 1, updated_at = NOW() WHERE id = $1`,
                    [a.id]);
                sent++;
            } catch (e) { console.warn('[profile-nudge] one failed:', e.message); }
        }
        if (sent) console.log(`[profile-nudge] sent ${sent} finish-your-profile nudge(s)`);

        // AL-03: a draft that's gone 21 days without publishing → dormant_draft
        // (newsletter only; re-enters as draft on next login via onAgentLogin).
        try {
            const stale = await pool.query(
                `SELECT id FROM agents
                  WHERE lifecycle_state = 'draft' AND deleted_at IS NULL
                    AND created_at < NOW() - INTERVAL '21 days'`);
            for (const s of stale.rows) {
                await require('./lifecycle').setLifecycleState(s.id, 'dormant_draft', '21 days without publishing', 'onboarding-nudge');
            }
            if (stale.rows.length) console.log(`[profile-nudge] ${stale.rows.length} draft(s) → dormant_draft`);
        } catch (e) { console.warn('[profile-nudge] dormancy transition failed:', e.message); }
    } catch (e) {
        console.warn('[profile-nudge]', e.message);
    }
    return { sent };
}

// AL-07 (Route A, +72h) — the done-for-you SMS. Drafts abandon on friction (the
// headshot, the bio), not on lack of interest, so the highest-converting touch
// removes the work entirely and starts a phone conversation. Fires ONCE per
// agent, only after 72h and before dormancy (14d), only with SMS consent + a
// phone on file. No-op until Twilio is configured (like every other gated
// integration), so it's safe to ship dark.
//
// Deliberately NOT built here yet (blocked/deferred): the +24h "here's what your
// lake did last month" email needs AL-01 (Search Console/GA4, parked), and the
// +21d dormant_draft exit needs AL-03's lifecycle_state. Those land after their
// dependencies rather than as a throwaway milestone tracker now.
async function runDraftDoneForYouSms() {
    if (sms.isConfigured && !sms.isConfigured()) return { sent: 0 };   // dark until Twilio set
    let sent = 0;
    try {
        const { rows } = await pool.query(
            `SELECT a.id, a.display_name, a.service_areas, a.phone_public, u.phone
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE a.is_published = FALSE
                AND a.profile_status = 'draft'
                AND a.deleted_at IS NULL
                AND COALESCE(a.sms_alerts, TRUE) = TRUE
                AND a.dfy_sms_sent_at IS NULL
                AND a.created_at < NOW() - INTERVAL '72 hours'
                AND a.created_at > NOW() - INTERVAL '14 days'
                AND COALESCE(a.phone_public, u.phone, '') <> ''
              ORDER BY a.created_at ASC
              LIMIT 50`);
        for (const a of rows) {
            const to = sms.toE164(a.phone_public || a.phone);
            if (!to) continue;
            let areas = a.service_areas;
            if (!Array.isArray(areas)) { try { areas = JSON.parse(areas || '[]'); } catch (_) { areas = []; } }
            const lake = (areas[0] && String(areas[0])) || 'your lake';
            const body = `Hunter from MN Lake Homes — you started a ${lake} profile but didn't finish. `
                + `Send me a headshot and I'll write the rest for you and get it live today. No cost.`;
            try {
                const res = await sms.sendSms(to, body);
                if (res !== null) {   // sent (null = not configured / send failed)
                    await pool.query(`UPDATE agents SET dfy_sms_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, [a.id]);
                    sent++;
                }
            } catch (e) { console.warn('[dfy-sms] one failed:', e.message); }
        }
        if (sent) console.log(`[dfy-sms] sent ${sent} done-for-you SMS`);
    } catch (e) {
        console.warn('[dfy-sms]', e.message);
    }
    return { sent };
}

module.exports = { runProfileCompletionNudge, runDraftDoneForYouSms };
