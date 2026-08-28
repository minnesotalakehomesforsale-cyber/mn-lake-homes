'use strict';

// Block D — tokenised link mechanism: single-use, 7-day expiry, no login.

const pool = require('../src/database/pool');

const store = new Map();   // token → row
pool.query = async (sql, params = []) => {
    if (/INSERT INTO action_tokens/.test(sql)) {
        const [token, action, leadId, agentId, meta, ttlDays] = params;
        store.set(token, { token, action, lead_id: leadId, agent_id: agentId, meta, expires_at: new Date(Date.now() + ttlDays * 864e5).toISOString(), used_at: null, outcome: null });
        return { rows: [] };
    }
    if (/SELECT[\s\S]*FROM action_tokens WHERE token/.test(sql)) {
        const r = store.get(params[0]); return { rows: r ? [{ ...r }] : [] };
    }
    if (/UPDATE action_tokens SET used_at/.test(sql)) {
        const r = store.get(params[0]);
        if (r && !r.used_at && new Date(r.expires_at) > new Date()) {
            r.used_at = new Date().toISOString(); if (params[1]) r.outcome = params[1];
            return { rows: [{ action: r.action, lead_id: r.lead_id, agent_id: r.agent_id, meta: r.meta }] };
        }
        return { rows: [] };
    }
    if (/UPDATE action_tokens SET outcome/.test(sql)) { const r = store.get(params[0]); if (r) r.outcome = params[1]; return { rows: [] }; }
    return { rows: [] };
};

const T = require('../src/services/action-tokens');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    const token = await T.createToken({ action: 'mark_contacted', leadId: 'lead-1', agentId: 'agent-1' });
    ok(typeof token === 'string' && token.length >= 20, 'createToken returns an opaque token');
    ok(/\/a\/[A-Za-z0-9_-]+$/.test(T.actionUrl(token)), 'actionUrl builds a /a/<token> link');

    const peeked = await T.peek(token);
    ok(peeked && peeked.used_at === null, 'peek returns the token without consuming it');

    const claim = await T.consume(token, 'done');
    ok(claim && claim.action === 'mark_contacted' && claim.lead_id === 'lead-1', 'consume returns the claim');

    const again = await T.consume(token, 'done');
    ok(again === null, 'a consumed token cannot be used a second time (single use)');

    // Expiry.
    const expired = await T.createToken({ action: 'mark_contacted', leadId: 'lead-2', ttlDays: 7 });
    store.get(expired).expires_at = new Date(Date.now() - 1000).toISOString();
    ok((await T.consume(expired)) === null, 'an expired token cannot be consumed');

    ok((await T.consume('nope')) === null, 'an unknown token consumes to null');

    if (failures) { console.error(`\naction-tokens: ${failures} FAIL`); process.exit(1); }
    console.log('\naction-tokens: ALL PASSED');
})();
