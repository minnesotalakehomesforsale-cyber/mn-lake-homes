// lead-recovery.js — T018: no lead ever silently disappears.
//
// A lead is ALWAYS written to the DB before any integration runs (see
// lead.controller). If the HubSpot sync (or another downstream step) then
// fails, this module: (1) marks leads.pipeline_status = 'failed', (2) queues a
// retry with exponential backoff, and (3) fires an immediate alert (Slack
// incoming-webhook if SLACK_WEBHOOK_URL is set, else the owner email). A sweep
// re-attempts due jobs and resolves them on success; a daily recheck re-alerts
// anything still failed after 24h.
const pool = require('../database/pool');

const BACKOFF_SECONDS = [60, 300, 1800, 7200, 21600]; // 1m, 5m, 30m, 2h, 6h
const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

// ── Alerting ─────────────────────────────────────────────────────────────────
async function alertFailure({ leadId, kind, form, error }) {
    const text = `:rotating_light: Lead pipeline failure (${kind}) — lead \`${leadId}\`` +
        (form ? ` · form: ${form}` : '') +
        `\nError: ${error || 'unknown'}` +
        `\nThe lead is saved locally and queued for retry.`;
    const hook = process.env.SLACK_WEBHOOK_URL;
    if (hook) {
        try {
            const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
            if (r.ok) return;
            console.warn('[lead-recovery] slack alert non-200:', r.status);
        } catch (e) { console.warn('[lead-recovery] slack alert failed:', e.message); }
    }
    // Fallback: email the owner inbox.
    try {
        const emailService = require('./email');
        const to = process.env.ADMIN_EMAIL || process.env.LEAD_NOTIFY_EMAIL;
        if (to) await emailService.sendEmail({
            to, subject: `⚠️ Lead pipeline failure (${kind}) — ${leadId}`,
            html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${String(text).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>`,
            category: 'ops',
        });
    } catch (e) { console.warn('[lead-recovery] email alert failed:', e.message); }
}

async function getLeadForm(leadId) {
    try {
        const r = await pool.query(`SELECT lead_source, lead_type FROM leads WHERE id = $1 LIMIT 1`, [leadId]);
        return r.rows[0] ? (r.rows[0].lead_source || r.rows[0].lead_type || null) : null;
    } catch { return null; }
}

// ── Enqueue a failure (called from the lead controller) ──────────────────────
async function enqueue(leadId, kind, error) {
    if (!leadId) return;
    try {
        await pool.query(`UPDATE leads SET pipeline_status = 'failed', updated_at = NOW() WHERE id = $1`, [leadId]);
        const existing = await pool.query(
            `SELECT id FROM lead_retry_queue WHERE lead_id = $1 AND kind = $2 AND resolved = FALSE LIMIT 1`, [leadId, kind]);
        if (existing.rows.length) {
            await pool.query(`UPDATE lead_retry_queue SET last_error = $2, updated_at = NOW() WHERE id = $1`,
                [existing.rows[0].id, String(error || '').slice(0, 500)]);
            return; // already queued + already alerted
        }
        await pool.query(
            `INSERT INTO lead_retry_queue (lead_id, kind, attempts, next_attempt_at, last_error, alerted)
             VALUES ($1, $2, 0, NOW() + ($3 || ' seconds')::interval, $4, TRUE)`,
            [leadId, kind, BACKOFF_SECONDS[0], String(error || '').slice(0, 500)]);
        // First failure for this lead+kind → alert immediately.
        await alertFailure({ leadId, kind, form: await getLeadForm(leadId), error });
    } catch (e) { console.warn('[lead-recovery] enqueue failed:', e.message); }
}

// ── Retry sweep (runs on an interval) ────────────────────────────────────────
async function retryHubspot(leadId) {
    const hubspot = require('./hubspot');
    if (!hubspot.isActive || !hubspot.isActive()) return false; // still down → keep queued
    const r = await pool.query(
        `SELECT full_name, first_name, email, phone, assigned_user_id FROM leads WHERE id = $1 LIMIT 1`, [leadId]);
    const lead = r.rows[0];
    if (!lead) return true;            // lead gone → nothing to recover
    if (!lead.email) return true;      // no email → HubSpot was never the path; resolve
    const name = lead.full_name || lead.first_name || '';
    const res = await hubspot.syncContact({
        email: lead.email,
        firstname: lead.first_name || name.split(' ')[0],
        lastname: name.split(' ').slice(1).join(' '),
        phone: lead.phone || undefined,
        lifecyclestage: 'lead',
        lead_id: leadId,
    });
    if (res && res.id) {
        await pool.query(
            `UPDATE leads
                SET hs_contact_id = $1,
                    pipeline_status = CASE WHEN assigned_user_id IS NOT NULL THEN 'routed' ELSE 'sent_to_hubspot' END,
                    updated_at = NOW()
              WHERE id = $2`, [res.id, leadId]);
        return true;
    }
    return false;
}

async function runRetrySweep() {
    try {
        const { rows } = await pool.query(
            `SELECT id, lead_id, kind, attempts FROM lead_retry_queue
              WHERE resolved = FALSE AND next_attempt_at <= NOW() AND attempts < $1
              ORDER BY next_attempt_at ASC LIMIT 50`, [MAX_ATTEMPTS]);
        let recovered = 0;
        for (const job of rows) {
            let ok = false, err = null;
            try {
                ok = job.kind === 'hubspot' ? await retryHubspot(job.lead_id) : true;
            } catch (e) { err = e.message; }
            if (ok) {
                await pool.query(`UPDATE lead_retry_queue SET resolved = TRUE, updated_at = NOW() WHERE id = $1`, [job.id]);
                recovered++;
            } else {
                const attempts = job.attempts + 1;
                const backoff = BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)];
                await pool.query(
                    `UPDATE lead_retry_queue
                        SET attempts = $2, next_attempt_at = NOW() + ($3 || ' seconds')::interval,
                            last_error = $4, updated_at = NOW()
                      WHERE id = $1`, [job.id, attempts, backoff, String(err || 'still failing').slice(0, 500)]);
            }
        }
        if (recovered) console.log(`[lead-recovery] recovered ${recovered} lead(s)`);
        return { recovered };
    } catch (e) { console.warn('[lead-recovery] sweep failed:', e.message); return { recovered: 0, error: e.message }; }
}

// ── Daily recheck: re-alert anything still failed after 24h ───────────────────
async function runFailedRecheck() {
    try {
        const { rows } = await pool.query(
            `SELECT lead_id, kind, attempts, last_error FROM lead_retry_queue
              WHERE resolved = FALSE AND created_at < NOW() - INTERVAL '24 hours'
              ORDER BY created_at ASC LIMIT 25`);
        if (!rows.length) return { stuck: 0 };
        const lines = rows.map(j => `• ${j.lead_id} (${j.kind}, ${j.attempts} tries): ${j.last_error || ''}`).join('\n');
        await alertFailure({ leadId: `${rows.length} lead(s)`, kind: 'daily-recheck', form: null,
            error: `Still unrecovered after 24h:\n${lines}` });
        return { stuck: rows.length };
    } catch (e) { console.warn('[lead-recovery] recheck failed:', e.message); return { stuck: 0, error: e.message }; }
}

module.exports = { enqueue, runRetrySweep, runFailedRecheck, alertFailure };
