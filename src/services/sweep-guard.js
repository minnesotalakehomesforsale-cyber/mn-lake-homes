'use strict';

// Backlog-catchup guard for time-delayed sweeps.
//
// A sweep like EM-16 selects records by "event older than N" (routed >72h ago)
// with no LOWER bound. If the sweep was off and is then enabled, its first run
// processes the ENTIRE accumulated backlog at once — firing stale messages about
// ancient records, simultaneously, from a domain with no sending reputation.
// That is how a cold domain lands in spam on day one. (Observed: a lead matched
// 12 days earlier got its "72h" feedback + agent nudge the moment the sweeps came
// up.)
//
// sweepCutoff() returns the OLDEST event timestamp a sweep may act on. The caller
// adds `AND <event_col> >= $cutoff` to its selection. It combines two guards:
//
//   • First-run / re-enable WATERMARK — the first run after a sweep is enabled
//     (or re-enabled after being off longer than staleAfterHours) stamps NOW(),
//     so a freshly-enabled sweep never replays a backlog. Deploys/restarts do NOT
//     reset it (the sweep resumes within a normal cycle); only a genuine long-off
//     gap does. This is the "nothing predating enablement" guarantee.
//
//   • Optional rolling FRESHNESS FLOOR (freshnessHours) — even in steady state,
//     never act on an event older than this (a "72h" check-in shouldn't fire on
//     something 3 weeks old). Omit for sweeps whose own cadence is long (the
//     ladder runs over 21 days) and rely on the watermark alone.
//
// State lives in app_config as 'sweep_cutoff:<name>'; its updated_at doubles as
// the last-run heartbeat the gap detector reads. value is JSONB (app_config.value
// is JSONB NOT NULL) — written via to_jsonb($::text), read with #>> '{}'.

const pool = require('../database/pool');

// ISO-8601 UTC strings from toISOString() are fixed-width, so lexical order ==
// chronological order — safe to compare with `>` and to pass as a query param
// against a TIMESTAMPTZ column.
async function sweepCutoff(name, opts = {}) {
    const { freshnessHours = null, staleAfterHours = 6 } = opts;
    const key = `sweep_cutoff:${name}`;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let enabledAtIso;
    try {
        const { rows } = await pool.query(
            `SELECT value #>> '{}' AS enabled_at, updated_at FROM app_config WHERE key = $1`, [key]);
        const row = rows[0];
        const gapHours = row ? (nowMs - new Date(row.updated_at).getTime()) / 3600000 : Infinity;
        if (!row || gapHours > staleAfterHours) {
            // First run ever, or the sweep was off longer than a normal cycle →
            // (re)enable. Stamp now so the accumulated backlog is skipped.
            enabledAtIso = nowIso;
            await pool.query(
                `INSERT INTO app_config (key, value, description)
                   VALUES ($1, to_jsonb($2::text), 'backlog-catchup watermark: oldest event a sweep may act on')
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
                [key, enabledAtIso]);
        } else {
            // Steady state: keep the established enable time; refresh updated_at so
            // the gap detector counts this run as recent activity.
            enabledAtIso = row.enabled_at || nowIso;
            await pool.query(`UPDATE app_config SET updated_at = NOW() WHERE key = $1`, [key]);
        }
    } catch (e) {
        // Fail SAFE toward silence: if the watermark can't be read/written, return
        // NOW() so the sweep acts on nothing older than this instant rather than
        // replaying a backlog. A quiet sweep is the correct failure here.
        console.warn(`[sweep-guard] ${name}:`, e.message);
        return nowIso;
    }
    if (freshnessHours == null) return enabledAtIso;
    const floorIso = new Date(nowMs - freshnessHours * 3600000).toISOString();
    return enabledAtIso > floorIso ? enabledAtIso : floorIso;   // the later (more restrictive) wins
}

module.exports = { sweepCutoff };
