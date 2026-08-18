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
    } catch (e) {
        console.warn('[profile-nudge]', e.message);
    }
    return { sent };
}

module.exports = { runProfileCompletionNudge };
