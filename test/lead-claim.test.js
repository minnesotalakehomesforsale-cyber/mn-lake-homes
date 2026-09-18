'use strict';

// lead-claim — the atomic first-come "claim it" action. Runs the real module SQL
// on pg-mem: the assigned agent claims and locks it; a second claim and a
// different agent are both refused; the ledger offer is closed on claim.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`
  CREATE TABLE agents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, deleted_at TIMESTAMPTZ);
  CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), assigned_user_id UUID, accepted_at TIMESTAMPTZ,
    agent_ack_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ, full_name TEXT, first_name TEXT, email TEXT,
    phone TEXT, target_lake TEXT, lead_type TEXT, message TEXT, property_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ);
  CREATE TABLE lead_offers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id UUID, status VARCHAR(16), claimed_at TIMESTAMPTZ);
`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

const { claimLead } = require('../src/services/lead-claim');

const U1 = crypto.randomUUID(), U2 = crypto.randomUUID();  // two agent users
const A1 = crypto.randomUUID(), A2 = crypto.randomUUID();

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    await memPool.query(`INSERT INTO agents (id, user_id) VALUES ($1,$2),($3,$4)`, [A1, U1, A2, U2]);
    // One lead assigned to agent U1, with an open ledger offer.
    const lead = crypto.randomUUID();
    await memPool.query(`INSERT INTO leads (id, assigned_user_id, full_name, first_name, target_lake, lead_type) VALUES ($1,$2,'Bret K','Bret','Gull Lake','buyer')`, [lead, U1]);
    await memPool.query(`INSERT INTO lead_offers (lead_id, status) VALUES ($1,'offered')`, [lead]);

    // A non-agent user can't claim.
    ok((await claimLead({ leadId: lead, userId: crypto.randomUUID() })).reason === 'not_an_agent', 'non-agent user → not_an_agent');

    // The wrong agent (not assigned) can't claim.
    ok((await claimLead({ leadId: lead, userId: U2 })).reason === 'not_yours', 'agent it is not assigned to → not_yours');

    // The assigned agent claims → success, with the lead info revealed.
    const res = await claimLead({ leadId: lead, userId: U1 });
    ok(res.claimed === true && res.lead && res.lead.target_lake === 'Gull Lake', 'assigned agent claims → success + lead info returned');

    // It's now locked: accepted_at + agent_ack_at set.
    const row = (await memPool.query(`SELECT accepted_at, agent_ack_at FROM leads WHERE id = $1`, [lead])).rows[0];
    ok(row.accepted_at && row.agent_ack_at, 'claim stamps accepted_at + agent_ack_at (locked + acked)');

    // The ledger offer was closed as claimed.
    const off = (await memPool.query(`SELECT status, claimed_at FROM lead_offers WHERE lead_id = $1`, [lead])).rows[0];
    ok(off.status === 'claimed' && off.claimed_at, 'open ledger offer closed as claimed');

    // Second claim (even by the same agent) is refused — already claimed.
    ok((await claimLead({ leadId: lead, userId: U1 })).reason === 'already_claimed', 'second claim → already_claimed (first-come locked)');

    // Unknown lead.
    ok((await claimLead({ leadId: crypto.randomUUID(), userId: U1 })).reason === 'not_found', 'unknown lead → not_found');

    if (failures) { console.error(`\nlead-claim: ${failures} FAIL`); process.exit(1); }
    console.log('\nlead-claim: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
