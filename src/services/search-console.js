/**
 * search-console.js — Google Search Console integration for Lake Intel (#1).
 *
 * Powers the "actual search queries that brought buyers to your lake pages"
 * half of the agent Lake Intel panel. Gated exactly like Stripe/HubSpot: it is
 * a NO-OP until credentials are configured, so the app runs fine without it and
 * the feature lights up the moment the env vars are set. No new npm deps — auth
 * is a service-account JWT (signed with the already-present `jsonwebtoken`) and
 * all HTTP is plain fetch.
 *
 * Setup (one-time, done by an admin with the GSC property):
 *   1. Create a Google Cloud service account, enable the Search Console API,
 *      and download its JSON key.
 *   2. In Search Console, add the service account's email as a full/restricted
 *      user on the property.
 *   3. Set env:
 *        GOOGLE_SC_CLIENT_EMAIL  = service account email
 *        GOOGLE_SC_PRIVATE_KEY   = the key's private_key (PEM, \n-escaped ok)
 *        GOOGLE_SC_SITE_URL      = 'sc-domain:minnesotalakehomesforsale.com'
 *                                  (or 'https://minnesotalakehomesforsale.com/')
 *
 * Until then, everything here returns { configured:false } and the UI hides.
 */
const jwt = require('jsonwebtoken');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function siteUrl() { return process.env.GOOGLE_SC_SITE_URL || ''; }
function isConfigured() {
    return !!(process.env.GOOGLE_SC_CLIENT_EMAIL && process.env.GOOGLE_SC_PRIVATE_KEY && siteUrl());
}

let _token = null, _tokenExp = 0;

// Service-account JWT → OAuth access token (cached ~50 min).
async function getAccessToken() {
    const nowMs = Date.now();
    if (_token && nowMs < _tokenExp - 60000) return _token;
    const key = String(process.env.GOOGLE_SC_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const iat = Math.floor(nowMs / 1000);
    const assertion = jwt.sign(
        { iss: process.env.GOOGLE_SC_CLIENT_EMAIL, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 },
        key, { algorithm: 'RS256' }
    );
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!res.ok) throw new Error(`GSC token ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    _token = data.access_token;
    _tokenExp = nowMs + (data.expires_in || 3600) * 1000;
    return _token;
}

function isoDaysAgo(days) {
    const d = new Date(Date.now() - days * 86400000);
    return d.toISOString().slice(0, 10);
}

/**
 * topQueriesForPaths(paths, { days=30, limit=15 })
 * Returns the top search queries that led to any of the given page paths,
 * aggregated across them. Each item: { query, clicks, impressions, ctr, position }.
 * Returns [] when not configured or on any error (fire-and-forget safe).
 *
 * @param {string[]} paths  page paths, e.g. ['/lakes/gull-lake', '/agents/jane']
 */
async function topQueriesForPaths(paths, { days = 30, limit = 15 } = {}) {
    if (!isConfigured() || !Array.isArray(paths) || !paths.length) return [];
    try {
        const token = await getAccessToken();
        const filters = paths.map(p => ({ dimension: 'page', operator: 'contains', expression: p }));
        const body = {
            startDate: isoDaysAgo(days),
            endDate: isoDaysAgo(0),
            dimensions: ['query'],
            // "contains" against any of the agent's pages (OR group).
            dimensionFilterGroups: [{ groupType: 'or', filters }],
            rowLimit: limit,
            dataState: 'all',
        };
        const res = await fetch(
            `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl())}/searchAnalytics/query`,
            { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (!res.ok) throw new Error(`GSC query ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        return (data.rows || []).map(r => ({
            query: r.keys?.[0] || '',
            clicks: r.clicks || 0,
            impressions: r.impressions || 0,
            ctr: r.ctr || 0,
            position: r.position != null ? Math.round(r.position * 10) / 10 : null,
        })).filter(r => r.query);
    } catch (e) {
        console.warn('[search-console]', e.message);
        return [];
    }
}

module.exports = { isConfigured, topQueriesForPaths };
