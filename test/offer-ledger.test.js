'use strict';

// offer-ledger — the lead-offer audit trail (Feature B foundation). Runs the
// real module SQL against an in-memory Postgres (pg-mem) so the queries are
// actually exercised, not stubbed. Framework-free: `node test/offer-ledger.test.js`.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
// Same columns as the prod migration (minus the partial unique index, which
// pg-mem doesn't model — the DB enforces the one-open-offer invariant in prod;
// here we test the module's close-then-open discipline that respects it).
db.public.none(`
  CREATE TABLE lead_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL, agent_id UUID, user_id UUID, tier VARCHAR(24),
    cycle_no INTEGER NOT NULL DEFAULT 1,
    offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_secs INTEGER, window_expires_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'offered',
    claimed_at TIMESTAMPTZ, source VARCHAR(24)
  );`);

const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

const led = require('../src/services/offer-ledger');

const LEAD = crypto.randomUUID();
const A = crypto.randomUUID(), B = crypto.randomUUID();

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    // Offer to agent A with a 900s window.
    const o1 = await led.recordOffer({ leadId: LEAD, agentId: A, tier: 'elite', cycleNo: 1, windowSecs: 900, source: 'auto' });
    ok(!!o1, 'recordOffer returns an id');

    const cur = await led.currentOffer(LEAD);
    ok(cur && cur.agent_id === A && cur.status === 'offered', 'currentOffer returns the open offer to A');
    ok(cur.window_expires_at && new Date(cur.window_expires_at) > new Date(), 'window_expires_at is set in the future');

    ok((await led.offeredThisCycle(LEAD, 1)).includes(A), 'offeredThisCycle(1) includes A');
    ok(!(await led.offeredThisCycle(LEAD, 1)).includes(B), 'offeredThisCycle(1) does not yet include B');

    // A's window expires → close it, relay to B.
    const closed = await led.closeOffer({ leadId: LEAD, status: 'expired' });
    ok(closed === 1, 'closeOffer(expired) closes exactly the open offer');
    ok((await led.currentOffer(LEAD)) === null, 'no open offer after A expired (before B is offered)');

    const o2 = await led.recordOffer({ leadId: LEAD, agentId: B, tier: 'prime', cycleNo: 1, windowSecs: 1800, source: 'relay' });
    ok(!!o2, 'relay records the offer to B');
    ok((await led.currentOffer(LEAD)).agent_id === B, 'currentOffer is now B');

    // B claims it.
    const claimClosed = await led.closeOffer({ offerId: o2, status: 'claimed', claimed: true });
    ok(claimClosed === 1, 'closeOffer(claimed) closes B\'s offer');
    const afterClaim = await led.leadChain(LEAD);
    const bRow = afterClaim.find(r => r.agent_id === B);
    ok(bRow.status === 'claimed' && bRow.claimed_at, 'B\'s row is claimed with a claimed_at stamp');

    // Chain + per-agent history reflect the whole life of the lead.
    ok(afterClaim.length === 2 && afterClaim[0].agent_id === A && afterClaim[1].agent_id === B, 'leadChain is the full ordered history (A expired → B claimed)');
    const aHist = await led.agentHistory(A);
    ok(aHist.length === 1 && aHist[0].status === 'expired', 'agentHistory(A) shows the one offer A lost');

    // Bad status guards.
    let threw = false; try { await led.closeOffer({ leadId: LEAD, status: 'bogus' }); } catch (_) { threw = true; }
    ok(threw, 'closeOffer rejects an invalid status');

    if (failures) { console.error(`\noffer-ledger: ${failures} FAIL`); process.exit(1); }
    console.log('\noffer-ledger: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
