'use strict';

// Block D — single-use, no-login action tokens for email buttons that must work
// from a phone with no session (mark-as-contacted, pass-this-back, the three 72h
// answers). One shared mechanism, built once, used by every Block D email.
//
//   createToken({ action, leadId, agentId, meta, ttlDays })  → opaque token string
//   actionUrl(token)                                          → the /a/<token> URL
//   peek(token)                                               → row without consuming (GET preview)
//   consume(token, outcome)                                   → atomically mark used; null if expired/used
//
// GET /a/:token only PREVIEWS (so email link-scanners that prefetch can't fire the
// action); the human's click lands on a confirm page whose button POSTs, and the
// POST consumes + performs. See the route in server.js.

const crypto = require('crypto');
const pool = require('../database/pool');

async function createToken({ action, leadId = null, agentId = null, meta = null, ttlDays = 7 }) {
    const token = crypto.randomBytes(24).toString('base64url');   // 32 url-safe chars
    await pool.query(
        `INSERT INTO action_tokens (token, action, lead_id, agent_id, meta, expires_at)
         VALUES ($1,$2,$3,$4,$5, NOW() + make_interval(days => $6))`,
        [token, action, leadId, agentId, meta ? JSON.stringify(meta) : null, ttlDays]);
    return token;
}

function actionUrl(token) {
    const base = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
    return `${base}/a/${token}`;
}

// Read the token without consuming — for the GET confirm page.
async function peek(token) {
    if (!token) return null;
    const { rows } = await pool.query(
        `SELECT token, action, lead_id, agent_id, meta, expires_at, used_at, outcome
           FROM action_tokens WHERE token = $1`, [token]);
    return rows[0] || null;
}

// Atomically consume: succeeds only if not already used and not expired. Records
// the human-readable outcome so a re-open (or a scanner) shows what happened.
async function consume(token, outcome = null) {
    if (!token) return null;
    const { rows } = await pool.query(
        `UPDATE action_tokens SET used_at = NOW(), outcome = COALESCE($2, outcome)
          WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()
          RETURNING action, lead_id, agent_id, meta`, [token, outcome]);
    return rows[0] || null;
}

module.exports = { createToken, actionUrl, peek, consume };
