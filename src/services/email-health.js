'use strict';

// EM-04 — Send-health monitor. The specific risk the audit named is SILENT
// failure: email quietly stops reaching people and nobody notices for weeks.
// This is the alarm. A sweep (every 15 min from server.js) evaluates four
// conditions against email_log + the transport config and, when any trips,
// raises a P1: a console.error every sweep (captured in platform logs even when
// email itself is down) plus a deduped internal alert email to the owner.
//
// The four conditions (from the spec):
//   1. transport auth/config error       — recent sends failing on auth, or the
//                                           Resend sandbox sender (rejects all real mail)
//   2. hard-bounce rate > 20% / last 50   — activates once bounce tracking flows
//   3. zero sends in 24h w/ other traffic — the app is trying but nothing lands
//   4. any one template fails >= 5 in 1h  — a specific template is broken
//
// EM-06 will formalise incidents (an incidents table + severity ladder); until
// then the dedupe is a simple cooldown on the last alert send in email_log.

const pool = require('../database/pool');
const email = require('./email');

const BOUNCE_PCT       = 20;   // condition 2 threshold
const TEMPLATE_FAILS   = 5;    // condition 4 threshold (per hour)
const ALERT_COOLDOWN_MIN = parseInt(process.env.EMAIL_HEALTH_COOLDOWN_MIN, 10) || 60;
const AUTH_ERR = /auth|api[_ ]?key|unauthori|invalid.*(key|token|credential)|forbidden|\b401\b|\b403\b|domain is not verified|not verified/i;

// Evaluate every condition. Pure read — never sends. Returned by the admin
// on-demand endpoint too, so keep it side-effect-free.
async function checkSendHealth() {
    const transport = process.env.RESEND_API_KEY ? 'resend'
        : (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ? 'gmail' : 'none';
    const from = process.env.EMAIL_FROM || (transport === 'resend' ? 'onboarding@resend.dev (sandbox)' : null);
    const sandbox = transport === 'resend' && /onboarding@resend\.dev/i.test(from || '');

    const [last50, last24, tmplFails] = await Promise.all([
        pool.query(
            `SELECT status, detail FROM email_log
              WHERE status IN ('sent','error','bounced')
              ORDER BY created_at DESC LIMIT 50`),
        pool.query(
            `SELECT COUNT(*) FILTER (WHERE status='sent')::int AS sent,
                    COUNT(*)::int AS total
               FROM email_log WHERE created_at >= NOW() - INTERVAL '24 hours'`),
        pool.query(
            `SELECT template_key, COUNT(*)::int AS fails FROM email_log
              WHERE status='error' AND created_at >= NOW() - INTERVAL '1 hour'
                AND template_key IS NOT NULL
              GROUP BY template_key HAVING COUNT(*) >= ${TEMPLATE_FAILS}
              ORDER BY fails DESC`),
    ]);

    const rows = last50.rows;
    const bounced = rows.filter(r => r.status === 'bounced').length;
    const deliverAttempts = rows.filter(r => r.status === 'sent' || r.status === 'bounced').length;
    const bounceRate = deliverAttempts > 0 ? +(bounced / deliverAttempts * 100).toFixed(1) : 0;
    const authErrors = rows.filter(r => r.status === 'error' && AUTH_ERR.test(String(r.detail || ''))).length;
    const sent24h = last24.rows[0].sent;
    const total24h = last24.rows[0].total;

    const triggered = [];
    // 1 — transport auth/config error
    if (transport === 'none') {
        triggered.push({ code: 'transport_none', label: 'No email transport configured', detail: 'set RESEND_API_KEY or GMAIL_USER+GMAIL_APP_PASSWORD' });
    } else if (sandbox) {
        triggered.push({ code: 'transport_sandbox', label: 'Sender is the Resend sandbox', detail: 'onboarding@resend.dev rejects all real recipients — set EMAIL_FROM to a verified domain' });
    }
    if (authErrors > 0) {
        triggered.push({ code: 'transport_auth', label: 'Transport auth/config errors', detail: `${authErrors} of the last ${rows.length} sends failed on auth/config` });
    }
    // 2 — hard-bounce rate
    if (bounceRate > BOUNCE_PCT) {
        triggered.push({ code: 'bounce_rate', label: `Hard-bounce rate ${bounceRate}%`, detail: `over the last ${deliverAttempts} delivery attempts (limit ${BOUNCE_PCT}%)` });
    }
    // 3 — zero sends in 24h while there is other email traffic
    if (sent24h === 0 && total24h > 0) {
        triggered.push({ code: 'no_sends', label: 'Zero sends in 24h', detail: `${total24h} email_log rows in 24h but none sent — email may be dead` });
    }
    // 4 — a single template failing repeatedly
    for (const t of tmplFails.rows) {
        triggered.push({ code: 'template_failing', label: `Template "${t.template_key}" failing`, detail: `${t.fails} failures in the last hour` });
    }

    return {
        healthy: triggered.length === 0,
        triggered,
        stats: { transport, from, sent24h, total24h, bounceRate, sampleSize: rows.length },
    };
}

// Has an alert already gone out inside the cooldown window? Dedupe so a standing
// outage doesn't email every 15 minutes. Keyed on the alert template's last
// SENT row; while the transport is down no alert sends, so this stays false and
// the next recovery delivers one — which is what we want.
async function alertedRecently() {
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM email_log
              WHERE template_key = 'email_health_alert' AND status = 'sent'
                AND created_at >= NOW() - make_interval(mins => $1) LIMIT 1`,
            [ALERT_COOLDOWN_MIN]);
        return rows.length > 0;
    } catch (_) { return false; }
}

// The scheduled sweep: check, and on any tripped condition raise the P1.
async function runSendHealthSweep() {
    const health = await checkSendHealth();
    if (health.healthy) return { healthy: true };

    const summary = health.triggered.map(c => c.label).join('; ');
    console.error(`[email-health] P1 — ${health.triggered.length} condition(s) tripped: ${summary} · ` +
        `transport=${health.stats.transport} sent24h=${health.stats.sent24h}`);

    if (await alertedRecently()) return { healthy: false, alerted: false, reason: 'cooldown' };

    try {
        await email.sendSendHealthAlert({ conditions: health.triggered, stats: health.stats });
    } catch (e) {
        console.error('[email-health] alert email failed:', e.message);
    }
    return { healthy: false, alerted: true, triggered: health.triggered };
}

module.exports = { checkSendHealth, runSendHealthSweep };
