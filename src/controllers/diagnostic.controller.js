// diagnostic.controller.js — T027: one URL for system health.
//
// GET /api/_diagnostic returns JSON covering: environment, DB connectivity,
// HubSpot + Stripe reachability, the MLS/listings feed last-sync time, and the
// most recent lead received. Every external check is time-boxed so a hung
// integration can't hang the endpoint. Nothing sensitive is returned (booleans,
// reasons, timestamps only). Optionally gate with DIAGNOSTIC_TOKEN (?token=...).
const pool = require('../database/pool');
const hubspot = require('../services/hubspot');

// Resolve a promise, or a `onTimeout` sentinel after `ms`.
function withTimeout(promise, ms, onTimeout) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(onTimeout), ms)),
    ]);
}

// A pool.query that rejects (rather than hangs) if the DB is unreachable, so no
// diagnostic check can hang the endpoint when the database is down.
async function timedQuery(sql, params, ms = 5000) {
    const r = await withTimeout(pool.query(sql, params), ms, '__timeout__');
    if (r === '__timeout__') throw new Error('timeout');
    return r;
}

// Postgres/network errors sometimes have an empty .message — fall back to the
// code so the diagnostic stays useful.
const errMsg = e => e && (e.message || e.code || e.name) || 'error';

async function checkDatabase() {
    const t0 = Date.now();
    try {
        const r = await withTimeout(pool.query('SELECT 1'), 5000, '__timeout__');
        if (r === '__timeout__') return { ok: false, status: 'fail', error: 'timeout' };
        return { ok: true, status: 'ok', latency_ms: Date.now() - t0 };
    } catch (e) {
        return { ok: false, status: 'fail', error: errMsg(e) };
    }
}

async function checkHubspot() {
    if (!hubspot.isConfigured || !hubspot.isConfigured()) {
        return { ok: true, status: 'not_configured', configured: false };
    }
    const t0 = Date.now();
    const r = await withTimeout(hubspot.ping(), 5000, { ok: false, reason: 'timeout' });
    return r.ok
        ? { ok: true, status: 'ok', configured: true, latency_ms: Date.now() - t0 }
        : { ok: false, status: 'fail', configured: true, error: r.reason || 'unreachable' };
}

async function checkStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return { ok: true, status: 'not_configured', configured: false };
    const t0 = Date.now();
    try {
        const stripe = require('stripe')(key);
        const r = await withTimeout(stripe.balance.retrieve(), 5000, '__timeout__');
        if (r === '__timeout__') return { ok: false, status: 'fail', configured: true, error: 'timeout' };
        return { ok: true, status: 'ok', configured: true, livemode: !!r.livemode, latency_ms: Date.now() - t0 };
    } catch (e) {
        return { ok: false, status: 'fail', configured: true, error: errMsg(e) };
    }
}

async function checkMlsFeed() {
    const configured = !!process.env.MLS_FEED_URL;
    try {
        const r = await timedQuery(`SELECT value FROM app_config WHERE key = 'mls_feed_last_sync'`);
        const raw = r.rows[0]?.value;
        const lastSync = raw ? (typeof raw === 'string' ? raw : String(raw)) : null;
        let activeListings = null;
        try {
            const c = await timedQuery(`SELECT COUNT(*)::int AS n FROM listings WHERE status = 'active'`);
            activeListings = c.rows[0].n;
        } catch (_) { /* listings table may not exist in some envs */ }
        return {
            ok: true,
            status: configured ? (lastSync ? 'ok' : 'never_synced') : 'not_configured',
            configured,
            last_sync: lastSync,
            active_listings: activeListings,
        };
    } catch (e) {
        return { ok: false, status: 'fail', configured, error: errMsg(e) };
    }
}

async function checkLastLead() {
    try {
        const r = await timedQuery(
            `SELECT created_at,
                    (SELECT COUNT(*)::int FROM leads WHERE created_at >= NOW() - INTERVAL '24 hours' AND deleted_at IS NULL) AS last_24h
               FROM leads
              WHERE deleted_at IS NULL
              ORDER BY created_at DESC
              LIMIT 1`);
        const row = r.rows[0];
        return {
            ok: true,
            status: 'ok',
            most_recent: row ? row.created_at : null,
            received_last_24h: row ? row.last_24h : 0,
        };
    } catch (e) {
        return { ok: false, status: 'fail', error: errMsg(e) };
    }
}

async function buildReport() {
    const [database, hubspotCheck, stripe, mlsFeed, lastLead] = await Promise.all([
        checkDatabase(), checkHubspot(), checkStripe(), checkMlsFeed(), checkLastLead(),
    ]);
    const checks = { database, hubspot: hubspotCheck, stripe, mls_feed: mlsFeed, last_lead: lastLead };
    // Overall: DB failing is a hard fail; any *configured* integration failing is
    // "degraded"; not_configured is neutral (green). All green → ok.
    const anyFail = Object.values(checks).some(c => c.ok === false);
    const status = database.ok === false ? 'fail' : (anyFail ? 'degraded' : 'ok');
    return {
        ok: status === 'ok',
        status,
        environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.round(process.uptime()),
        checks,
    };
}

// Cache the report briefly so a monitor (or a refresh-happy human) polling the
// endpoint can't hammer Stripe/HubSpot. ?fresh=1 bypasses the cache.
const CACHE_MS = 10 * 1000;
let _cache = { at: 0, body: null };

const health = async (req, res) => {
    // Optional shared-secret gate (leave DIAGNOSTIC_TOKEN unset for an open endpoint).
    const gate = process.env.DIAGNOSTIC_TOKEN;
    if (gate && req.query.token !== gate) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    let body;
    if (!req.query.fresh && _cache.body && (Date.now() - _cache.at) < CACHE_MS) {
        body = { ..._cache.body, cached: true };
    } else {
        body = await buildReport();
        _cache = { at: Date.now(), body };
    }

    res.set('Cache-Control', 'no-store');
    res.status(body.ok ? 200 : 503).json(body);
};

module.exports = { health };
