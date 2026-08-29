'use strict';

// EM-06 — the condition monitors that aren't tied to a single request: they run
// on a timer and decide whether a P1/P2 should be open. Each raises when its
// condition holds and resolves when it clears, so nothing needs an "all clear".
//
//   checkHeartbeats()   P2 — a scheduled sweep stopped running (dead worker). The
//                       piece with real value at low volume: sweeps run whether or
//                       not leads exist, so a dead worker shows up here in minutes
//                       instead of as "engagement is down" three weeks later.
//   checkSiteHealth()   P1 — the DB probe fails 3 times in a row.
//   checkFailureRates() P1 — Stripe webhook 3+/hour, DB errors 5+/10min.
//   checkZeroLeads48h() P1 — zero leads in 48h WHILE the 4-week average is > 0.
//                       DORMANT by design until we have lead volume; correct now,
//                       not coverage yet.

const pool = require('../database/pool');
const incidents = require('./incidents');

// Record that a sweep completed a run. checkHeartbeats reads these.
async function beat(name) {
    try {
        await pool.query(
            `INSERT INTO heartbeats (name, last_run_at) VALUES ($1, NOW())
             ON CONFLICT (name) DO UPDATE SET last_run_at = NOW()`, [name]);
    } catch (_) {}
}

// Sweeps we expect to see tick, with the age past which we treat silence as a
// dead worker (≈ 3× the interval, so one skipped run doesn't cry wolf). `enabled`
// ties the expectation to the same flag that gates the sweep in server.js — a
// sweep that's turned OFF is not a dead worker, so it must not page anyone. (This
// is what the default-OFF fleet inversion requires: a disabled sender simply
// stops beating, and silence there is intended, not a slump.)
const EXPECTED_SWEEPS = [
    { name: 'lead-sla', maxAgeMin: 45, enabled: () => process.env.LEAD_SLA_ENABLED === 'true' },        // runs every 15 min WHEN enabled
    { name: 'email-health', maxAgeMin: 45, enabled: () => process.env.EMAIL_HEALTH_MONITOR_ENABLED !== 'false' }, // alarm layer, default-on
    { name: 'p2-batch', maxAgeMin: 180, enabled: () => process.env.INCIDENT_ROUTER_ENABLED !== 'false' },         // alarm layer, default-on
];

async function checkHeartbeats() {
    for (const s of EXPECTED_SWEEPS) {
        try {
            // Turned off on purpose → not expected to beat. Clear any incident left
            // over from when it was on, and move on (don't alarm on intended silence).
            if (s.enabled && !s.enabled()) { await incidents.resolve(`missed_sweep:${s.name}`).catch(() => {}); continue; }
            const { rows } = await pool.query(`SELECT last_run_at FROM heartbeats WHERE name = $1`, [s.name]);
            const last = rows[0]?.last_run_at;
            // Only alarm on a sweep we've actually seen run — a fresh deploy that
            // hasn't ticked yet shouldn't page anyone.
            if (!last) continue;
            const stale = (Date.now() - new Date(last).getTime()) > s.maxAgeMin * 60000;
            if (stale) {
                await incidents.raise({
                    key: `missed_sweep:${s.name}`, severity: 'P2',
                    title: `Scheduled sweep "${s.name}" has stopped running`,
                    detail: `Last completed ${new Date(last).toISOString()}; expected about every ${Math.round(s.maxAgeMin / 3)} min. A dead worker surfaces here before it looks like a slump.`,
                    adminLink: '/pages/admin/system.html',
                });
            } else {
                await incidents.resolve(`missed_sweep:${s.name}`);
            }
        } catch (_) {}
    }
}

let siteHealthFails = 0;
async function checkSiteHealth() {
    let up = false;
    try { await pool.query('SELECT 1'); up = true; } catch (_) { up = false; }
    if (up) {
        siteHealthFails = 0;
        await incidents.resolve('site_health');
    } else {
        siteHealthFails++;
        if (siteHealthFails >= 3) {
            await incidents.raise({
                key: 'site_health', severity: 'P1',
                title: 'Site health check failing',
                detail: `${siteHealthFails} consecutive DB-probe failures.`,
                effect: 'The app cannot reach its database — the site is likely down for everyone.',
                checkFirst: 'Database host status and connection pool; the most recent deploy.',
                adminLink: '/api/_diagnostic',
            });
        }
    }
    return siteHealthFails;
}

async function checkFailureRates() {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*) FILTER (WHERE incident_key = 'failure:stripe_webhook' AND created_at > NOW() - INTERVAL '1 hour')::int  AS stripe_h,
                    COUNT(*) FILTER (WHERE incident_key = 'failure:db'             AND created_at > NOW() - INTERVAL '10 minutes')::int AS db_10m
               FROM incidents WHERE severity = 'P3'`);
        const stripeH = rows[0].stripe_h, db10 = rows[0].db_10m;
        if (stripeH >= 3) {
            await incidents.raise({
                key: 'stripe_webhook_failing', severity: 'P1',
                title: 'Stripe webhook handler failing',
                detail: `${stripeH} failures in the last hour.`,
                effect: 'Payments and subscription changes may not be recording — money events are being missed.',
                checkFirst: 'Stripe dashboard → webhook delivery logs, and the server error logs.',
                adminLink: '/pages/admin/financials.html',
            });
        } else { await incidents.resolve('stripe_webhook_failing'); }
        if (db10 >= 5) {
            await incidents.raise({
                key: 'db_errors', severity: 'P1',
                title: 'Database errors',
                detail: `${db10} database errors in the last 10 minutes.`,
                effect: 'Requests are failing intermittently.',
                checkFirst: 'DB host status, connection pool limits, the most recent deploy.',
                adminLink: '/api/_diagnostic',
            });
        } else { await incidents.resolve('db_errors'); }
    } catch (_) {}
}

async function checkZeroLeads48h() {
    try {
        const { rows } = await pool.query(
            `SELECT (SELECT COUNT(*) FROM leads WHERE created_at > NOW() - INTERVAL '48 hours' AND deleted_at IS NULL)::int AS recent,
                    (SELECT COUNT(*) FROM leads WHERE created_at > NOW() - INTERVAL '28 days'  AND deleted_at IS NULL)::int AS month`);
        const recent = rows[0].recent, weeklyAvg = rows[0].month / 4;
        // Dormant until there's a baseline: only fires when the 4-week average is
        // actually above zero. Today that average is ~0, so this stays quiet.
        if (recent === 0 && weeklyAvg > 0) {
            await incidents.raise({
                key: 'zero_leads_48h', severity: 'P1',
                title: 'Zero leads in 48 hours',
                detail: `No leads in 48h while the 4-week average is ${weeklyAvg.toFixed(1)}/week.`,
                effect: 'Lead flow has stopped — the form or routing may be broken.',
                checkFirst: 'Submit a test lead; check for a lead-form 5xx incident and the geocoder.',
                adminLink: '/pages/admin/leads.html',
            });
        } else {
            await incidents.resolve('zero_leads_48h');
        }
        return { recent, weeklyAvg };
    } catch (_) { return null; }
}

async function runMonitors() {
    await checkHeartbeats();
    await checkSiteHealth();
    await checkFailureRates();
}
async function runDailyMonitors() {
    await checkZeroLeads48h();
}

module.exports = {
    beat, runMonitors, runDailyMonitors,
    checkHeartbeats, checkSiteHealth, checkFailureRates, checkZeroLeads48h,
    _resetSiteHealth: () => { siteHealthFails = 0; },   // for tests
};
