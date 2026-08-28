'use strict';

// sweep-guard — the backlog-catchup guard. A time-delayed sweep that was off then
// enabled must not replay its whole backlog at once (the "12-day-old lead got its
// 72h feedback the moment the sweep came up" bug). Proves: first run skips the
// backlog, steady state applies the rolling freshness floor, a recent enable wins
// over the floor, a long-off gap resets the watermark, no-floor returns the raw
// watermark (ladder), and a DB error fails safe toward silence.

const pool = require('../src/database/pool');

let store = {};        // key -> { value(ISO), updated_at(ms) }
let throwNext = false;
pool.query = async (sql, params = []) => {
    if (throwNext) throw new Error('boom');
    if (/SELECT value .* FROM app_config WHERE key = \$1/.test(sql)) {
        const row = store[params[0]];
        return { rows: row ? [{ enabled_at: row.value, updated_at: new Date(row.updated_at).toISOString() }] : [] };
    }
    if (/INSERT INTO app_config/.test(sql)) {
        store[params[0]] = { value: params[1], updated_at: Date.now() };
        return { rows: [] };
    }
    if (/UPDATE app_config SET updated_at/.test(sql)) {
        if (store[params[0]]) store[params[0]].updated_at = Date.now();
        return { rows: [] };
    }
    return { rows: [] };
};

const { sweepCutoff } = require('../src/services/sweep-guard');

const DAY = 86400e3;
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const near = (iso, expectedMs, tol = 5000) => Math.abs(new Date(iso).getTime() - expectedMs) < tol;

(async () => {
    // 1) First run ever: no watermark → stamp now, act on nothing older (backlog skipped).
    store = {};
    let c = await sweepCutoff('a', { freshnessHours: 168, staleAfterHours: 8 });
    ok(near(c, Date.now()), 'first run → cutoff = now (backlog skipped)');
    ok(store['sweep_cutoff:a'] && near(store['sweep_cutoff:a'].value, Date.now()), 'first run stamps the watermark = now');

    // 2) Steady state, enable long ago → the rolling freshness floor (now - 7d) dominates.
    store = { 'sweep_cutoff:b': { value: new Date(Date.now() - 30 * DAY).toISOString(), updated_at: Date.now() - 60e3 } };
    c = await sweepCutoff('b', { freshnessHours: 168, staleAfterHours: 8 });
    ok(near(c, Date.now() - 7 * DAY), 'steady state, old enable → rolling 7-day freshness floor');

    // 3) Steady state, enable recent → the watermark (newer than the floor) wins.
    store = { 'sweep_cutoff:c': { value: new Date(Date.now() - 2 * DAY).toISOString(), updated_at: Date.now() - 60e3 } };
    c = await sweepCutoff('c', { freshnessHours: 168, staleAfterHours: 8 });
    ok(near(c, Date.now() - 2 * DAY), 'steady state, recent enable → watermark beats the floor');

    // 4) Re-enable after a gap longer than staleAfterHours → reset to now, skip the backlog.
    store = { 'sweep_cutoff:d': { value: new Date(Date.now() - 30 * DAY).toISOString(), updated_at: Date.now() - 20 * 3600e3 } };
    c = await sweepCutoff('d', { freshnessHours: 168, staleAfterHours: 8 });
    ok(near(c, Date.now()), 're-enable after long-off → reset to now (backlog skipped)');
    ok(near(store['sweep_cutoff:d'].value, Date.now()), 're-enable rewrites the watermark to now');

    // 5) No freshnessHours (ladder) → return the raw enable watermark, unfloored.
    store = { 'sweep_cutoff:e': { value: new Date(Date.now() - 30 * DAY).toISOString(), updated_at: Date.now() - 60e3 } };
    c = await sweepCutoff('e', { staleAfterHours: 36 });
    ok(near(c, Date.now() - 30 * DAY), 'no freshnessHours → returns the enable watermark unfloored');

    // 6) DB error → fail safe to now (act on nothing older rather than replay a backlog).
    throwNext = true;
    c = await sweepCutoff('f', { freshnessHours: 168, staleAfterHours: 8 });
    throwNext = false;
    ok(near(c, Date.now()), 'pool error → fail safe to now (send nothing older)');

    if (failures) { console.error(`\nsweep-guard: ${failures} FAIL`); process.exit(1); }
    console.log('\nsweep-guard: ALL PASSED');
})();
