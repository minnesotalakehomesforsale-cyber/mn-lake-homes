'use strict';

// lead-relay (B2) — the timed round-robin relay engine. Runs the real engine +
// ledger SQL on pg-mem with routeLead mocked to hand back eligible agents in
// order. Verifies: first offer, relay to the next, no-repeat-until-cycle-restart,
// looping, the MAX_CYCLES cap → held, and that a claim stops the relay.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`
  CREATE TABLE agents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, deleted_at TIMESTAMPTZ);
  CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), route_lat DOUBLE PRECISION, route_lng DOUBLE PRECISION,
    lake_id UUID, accepted_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ, assigned_user_id UUID, agent_id UUID,
    agent_ack_at TIMESTAMPTZ, routed_at TIMESTAMPTZ, assigned_at TIMESTAMPTZ, held_no_agent BOOLEAN DEFAULT FALSE,
    lead_status TEXT, updated_at TIMESTAMPTZ);
  CREATE TABLE lead_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id UUID, agent_id UUID, user_id UUID, tier VARCHAR(24),
    cycle_no INTEGER NOT NULL DEFAULT 1, offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), window_secs INTEGER,
    window_expires_at TIMESTAMPTZ, status VARCHAR(16) NOT NULL DEFAULT 'offered', claimed_at TIMESTAMPTZ, source VARCHAR(24));
`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

// Silence the best-effort side effects (they'd hit tables pg-mem doesn't have).
require('../src/services/agent-notify').notifyAgentOfLead = () => {};
require('../src/services/email').sendMatchedAgentNotification = () => {};
require('../src/services/incidents').raise = () => {};

// Two eligible agents; routeLead hands back the first not excluded, else null.
const U1 = crypto.randomUUID(), U2 = crypto.randomUUID();
const A1 = crypto.randomUUID(), A2 = crypto.randomUUID();
const AGENTS = [
    { agentId: A1, userId: U1, tierCode: 'elite', fullName: 'Ann Elite', email: 'a@x.com' },
    { agentId: A2, userId: U2, tierCode: 'basic', fullName: 'Bob Basic', email: 'b@x.com' },
];
require('../src/services/lead-router').routeLead = async ({ excludeUserIds = [] } = {}) => {
    const ex = new Set(excludeUserIds.map(String));
    return AGENTS.find(a => !ex.has(String(a.userId))) || null;
};

const relay = require('../src/services/lead-relay');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const openOf = async (leadId) => (await memPool.query(`SELECT agent_id, cycle_no FROM lead_offers WHERE lead_id=$1 AND status='offered'`, [leadId])).rows[0];
const assignedUser = async (leadId) => (await memPool.query(`SELECT assigned_user_id FROM leads WHERE id=$1`, [leadId])).rows[0].assigned_user_id;

(async () => {
    await memPool.query(`INSERT INTO agents (id,user_id) VALUES ($1,$2),($3,$4)`, [A1, U1, A2, U2]);

    // ── window sizing ──
    ok((await relay.claimWindowSecs('elite')) === 3600 && (await relay.claimWindowSecs('basic')) === 900, 'per-tier windows: elite 60m, basic 15m');
    ok((await relay.claimWindowSecs('unknown')) === 900, 'unknown tier → standard fallback');

    // ── the relay loop ──
    const lead = crypto.randomUUID();
    await memPool.query(`INSERT INTO leads (id, route_lat, route_lng) VALUES ($1, 46.3, -94.2)`, [lead]);

    let r = await relay.openInitialOffer(lead);
    ok(r.action === 'offered' && r.agentId === A1 && r.cycleNo === 1, 'first offer → agent A (cycle 1)');
    ok((await assignedUser(lead)) === U1, 'lead assigned_user_id points at the active agent (Option X)');
    let cur = await openOf(lead);
    ok(cur.agent_id === A1, 'exactly one open offer, to A');

    r = await relay.advanceLead(lead);
    ok(r.action === 'offered' && r.agentId === A2 && r.cycleNo === 1, 'window expired → relay to agent B (same cycle)');
    ok((await memPool.query(`SELECT count(*)::int n FROM lead_offers WHERE lead_id=$1 AND status='expired'`, [lead])).rows[0].n === 1, 'A\'s offer marked expired in the ledger');

    r = await relay.advanceLead(lead);
    ok(r.action === 'offered' && r.agentId === A1 && r.cycleNo === 2, 'both offered this cycle → cycle restarts, back to A (cycle 2)');

    r = await relay.advanceLead(lead);   // B cycle 2
    ok(r.agentId === A2 && r.cycleNo === 2, 'cycle 2 continues to B');
    r = await relay.advanceLead(lead);   // A cycle 3
    ok(r.cycleNo === 3, 'into cycle 3 (A)');
    r = await relay.advanceLead(lead);   // B cycle 3
    ok(r.cycleNo === 3, 'cycle 3 (B)');

    // Next advance: cycle 3 exhausted AND at MAX_CYCLES → held.
    r = await relay.advanceLead(lead);
    ok(r.action === 'held', 'exhausted all cycles at the cap → held for admin');
    const held = (await memPool.query(`SELECT held_no_agent, lead_status, assigned_user_id FROM leads WHERE id=$1`, [lead])).rows[0];
    ok(held.held_no_agent === true && held.lead_status === 'held_no_agent' && !held.assigned_user_id, 'held lead: flagged, status set, unassigned');
    ok(!(await openOf(lead)), 'no open offer once held');

    // ── a claim stops the relay ──
    const lead2 = crypto.randomUUID();
    await memPool.query(`INSERT INTO leads (id, route_lat, route_lng) VALUES ($1, 46.3, -94.2)`, [lead2]);
    await relay.openInitialOffer(lead2);
    await memPool.query(`UPDATE leads SET accepted_at = NOW() WHERE id=$1`, [lead2]);   // agent claimed
    r = await relay.advanceLead(lead2);
    ok(r.action === 'claimed', 'a claimed lead is not relayed further');

    if (failures) { console.error(`\nlead-relay: ${failures} FAIL`); process.exit(1); }
    console.log('\nlead-relay: ALL PASSED');
})().catch(e => { console.error('test error:', e.message, e.stack); process.exit(2); });
