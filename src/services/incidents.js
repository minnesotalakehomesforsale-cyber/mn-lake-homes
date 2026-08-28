'use strict';

// EM-06 — the incident router. Every alert in the system routes through here
// instead of emailing the owner directly, so a stream of notifications becomes a
// small number of things that actually need a human.
//
//   raise({ key, severity, ... })  record/increment an incident; maybe alert
//   resolve(key)                    clear the open incident for a key (auto-resolve)
//   runP2Batch()                    hourly: ONE digest of the open P2 incidents
//   weeklyIncidents()               open + just-resolved rows for the weekly report
//
// Severity:
//   P1 — email immediately, deduped to once/hour per key; after 5 emails for one
//        unresolved incident, flag the subject and go quiet until it resolves
//        (a P1 that emails twelve times is a P1 nobody reads).
//   P2 — never emails on raise; the hourly batch sends one email listing all open
//        P2 incidents, each with its occurrence count.
//   P3 — recorded only; surfaced by the weekly report, never its own email.

const pool = require('../database/pool');
const email = require('./email');

const P1_DEDUPE_MIN = 60;   // at most one P1 email per key per hour
const P1_MAX_EMAILS = 5;    // then go quiet until resolved

// Upsert the open incident for this key (one open row per key via the partial
// unique index) and return the current row.
async function upsert({ key, severity, title, detail, effect, checkFirst, adminLink }) {
    const { rows } = await pool.query(
        `INSERT INTO incidents (incident_key, severity, title, detail, effect, check_first, admin_link)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (incident_key) WHERE status = 'open'
         DO UPDATE SET occurrences = incidents.occurrences + 1,
                       last_seen_at = NOW(),
                       title = EXCLUDED.title, detail = EXCLUDED.detail,
                       effect = EXCLUDED.effect, check_first = EXCLUDED.check_first,
                       admin_link = EXCLUDED.admin_link
         RETURNING *`,
        [key, severity, title, detail || null, effect || null, checkFirst || null, adminLink || null]);
    return rows[0];
}

async function raise(opts) {
    const severity = opts.severity || 'P2';
    let inc;
    try { inc = await upsert({ ...opts, severity }); }
    catch (e) { console.warn('[incidents] upsert failed:', e.message); return { ok: false }; }

    if (severity !== 'P1') return { ok: true, incident: inc, notified: false };

    // P1 — decide whether to email now.
    const ageMin = inc.last_notified_at ? (Date.now() - new Date(inc.last_notified_at).getTime()) / 60000 : Infinity;
    if (inc.notify_count >= P1_MAX_EMAILS || ageMin < P1_DEDUPE_MIN) {
        return { ok: true, incident: inc, notified: false };
    }
    const willBeRepeated = inc.notify_count >= (P1_MAX_EMAILS - 1);   // the last (5th) email flags repetition
    try {
        await email.sendIncidentAlert({
            title: inc.title, effect: inc.effect, checkFirst: inc.check_first,
            adminLink: inc.admin_link, occurrences: inc.occurrences, repeated: inc.notify_count > 0 || willBeRepeated,
        });
        await pool.query(`UPDATE incidents SET notify_count = notify_count + 1, last_notified_at = NOW() WHERE id = $1`, [inc.id]);
    } catch (e) { console.warn('[incidents] P1 email failed:', e.message); }
    return { ok: true, incident: inc, notified: true };
}

// EM-07 — record a P3 event (a routine business signal: signup, cancel, payment).
// Point-in-time, so it's its own row (status 'logged', outside the open-incident
// unique index) — NO email, ever. The weekly report and the Email tab read these.
async function logEvent({ key, title, detail }) {
    try {
        await pool.query(
            `INSERT INTO incidents (incident_key, severity, title, detail, status)
             VALUES ($1, 'P3', $2, $3, 'logged')`,
            [key || 'event', title, detail || null]);
        return { ok: true };
    } catch (e) { console.warn('[incidents] logEvent failed:', e.message); return { ok: false }; }
}

// Auto-resolve: close the open incident for a key. Safe to call every sweep even
// when nothing is open. The weekly report still shows it as resolved this period.
async function resolve(key) {
    try {
        const { rowCount } = await pool.query(
            `UPDATE incidents SET status = 'resolved', resolved_at = NOW()
              WHERE incident_key = $1 AND status = 'open'`, [key]);
        return rowCount > 0;
    } catch (e) { console.warn('[incidents] resolve failed:', e.message); return false; }
}

// Hourly P2 digest — exactly one email listing every open P2 incident touched
// since we last sent, each with its occurrence count. Nothing new → no email.
async function runP2Batch() {
    let rows;
    try {
        ({ rows } = await pool.query(
            `SELECT * FROM incidents
              WHERE status = 'open' AND severity = 'P2'
                AND (last_notified_at IS NULL OR last_seen_at > last_notified_at)
                AND (last_notified_at IS NULL OR last_notified_at < NOW() - make_interval(mins => $1))
              ORDER BY last_seen_at DESC`, [P1_DEDUPE_MIN]));
    } catch (e) { console.warn('[incidents] P2 batch query failed:', e.message); return { sent: false }; }
    if (!rows.length) return { sent: false };
    // Every other P2 is a fault; an unrouted lead is an OPPORTUNITY — real demand
    // on a named lake, our best agent-recruiting signal. Sort it to the top so it
    // doesn't read as fault #9 in an hourly digest.
    const isOpportunity = r => /^lead_no_agent/.test(r.incident_key || '');
    rows.sort((a, b) => (isOpportunity(b) ? 1 : 0) - (isOpportunity(a) ? 1 : 0)
        || new Date(b.last_seen_at) - new Date(a.last_seen_at));
    try {
        await email.sendIncidentDigest({ incidents: rows });
        const ids = rows.map(r => r.id);
        await pool.query(`UPDATE incidents SET notify_count = notify_count + 1, last_notified_at = NOW() WHERE id = ANY($1)`, [ids]);
    } catch (e) { console.warn('[incidents] P2 digest email failed:', e.message); return { sent: false }; }
    return { sent: true, count: rows.length };
}

// For the weekly report (EM-08/09): every P3 event plus any incident opened or
// resolved in the window.
async function weeklyIncidents(sinceDays = 7) {
    const { rows } = await pool.query(
        `SELECT incident_key, severity, title, detail, status, occurrences,
                first_seen_at, last_seen_at, resolved_at
           FROM incidents
          WHERE created_at >= NOW() - make_interval(days => $1)
             OR resolved_at >= NOW() - make_interval(days => $1)
             OR status = 'open'
          ORDER BY severity, last_seen_at DESC`, [sinceDays]);
    return rows;
}

module.exports = { raise, resolve, logEvent, runP2Batch, weeklyIncidents };
