'use strict';

// Feature B2 — the timed round-robin relay engine (PAYING agents only).
//
// A lead is offered to eligible agents ONE AT A TIME. The active agent gets a
// claim window sized by their plan (higher tier = longer). First to claim locks
// it (see services/lead-claim.js — Option X: only the active agent can claim). If
// the window expires unclaimed, the lead relays to the next eligible agent, and
// won't be re-offered to anyone until everyone eligible has had a turn this cycle;
// then the cycle restarts and loops, up to MAX_CYCLES, after which it's held for
// admin. Every offer/expiry/claim is a row in the lead_offers ledger (B1).
//
// Gated by LEAD_RELAY_ENABLED (default-off, fleet convention). Late requires keep
// routeLead / notify / email injectable for tests.

const pool = require('../database/pool');
const ledger = require('./offer-ledger');

const MAX_CYCLES = 3;   // full passes through the eligible agents before we give up

// Per-tier claim window in SECONDS. Tunable via app_config 'lead_claim_windows'
// (a JSONB object of {tierCode: seconds}); these are the defaults.
const DEFAULT_WINDOWS = { founder: 7200, elite: 3600, prime: 1800, basic: 900, standard: 900 };
async function claimWindowSecs(tierCode) {
    let cfg = {};
    try {
        const { rows } = await pool.query(`SELECT value FROM app_config WHERE key = 'lead_claim_windows'`);
        if (rows[0] && rows[0].value) cfg = typeof rows[0].value === 'object' ? rows[0].value : JSON.parse(rows[0].value);
    } catch (_) {}
    const w = { ...DEFAULT_WINDOWS, ...cfg };
    return Number(w[String(tierCode || '').toLowerCase()]) || Number(w.standard) || 900;
}

async function agentUserIds(agentIds) {
    const ids = (agentIds || []).filter(Boolean);
    if (!ids.length) return [];
    // Build an explicit placeholder list ($1,$2,…) rather than = ANY(array); it's
    // portable across drivers and the id set is always small (agents in one area).
    const ph = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(`SELECT user_id FROM agents WHERE id IN (${ph}) AND user_id IS NOT NULL`, ids);
    return rows.map(r => r.user_id);
}

async function leadRouting(leadId) {
    const { rows } = await pool.query(
        `SELECT id, route_lat, route_lng, lake_id, accepted_at, deleted_at FROM leads WHERE id = $1 LIMIT 1`, [leadId]);
    return rows[0] || null;
}

// Open an offer to `pick` (a routeLead result). Closes any current open offer as
// superseded, records the new one, points the lead's assigned_user_id at this
// agent (so their claim wins — Option X), and alerts them in-portal + by email.
async function openOffer({ leadId, pick, cycleNo }) {
    const secs = await claimWindowSecs(pick.tierCode);
    try { await ledger.closeOffer({ leadId, status: 'superseded' }); } catch (_) {}
    await ledger.recordOffer({ leadId, agentId: pick.agentId, userId: pick.userId, tier: pick.tierCode, cycleNo, windowSecs: secs, source: 'relay' });
    await pool.query(
        `UPDATE leads
            SET assigned_user_id = $1, agent_id = $2, agent_ack_at = NULL,
                routed_at = COALESCE(routed_at, NOW()), assigned_at = NOW(), updated_at = NOW()
          WHERE id = $3 AND accepted_at IS NULL`, [pick.userId, pick.agentId, leadId]);
    const lakeName = pick.lakeName || pick.tagName || null;
    try { require('./agent-notify').notifyAgentOfLead(pick.agentId, { lead: { id: leadId, target_lake: lakeName }, kind: 'offer' }); } catch (_) {}
    try {
        const em = require('./email');
        if (em.sendMatchedAgentNotification && pick.email) {
            em.sendMatchedAgentNotification({ to: pick.email, agentFirstName: (pick.fullName || '').split(' ')[0] || 'there', lead: { id: leadId }, distanceMiles: pick.distanceMiles, matchedAreas: [lakeName].filter(Boolean) });
        }
    } catch (_) {}
    return secs;
}

// Nobody claimed after all cycles → park it for a human (and flag it).
async function holdForAdmin(leadId, cycleNo) {
    try {
        await ledger.closeOffer({ leadId, status: 'expired' });
        await pool.query(
            `UPDATE leads SET held_no_agent = TRUE, lead_status = 'held_no_agent', assigned_user_id = NULL, agent_id = NULL, updated_at = NOW()
              WHERE id = $1 AND accepted_at IS NULL`, [leadId]);
        require('./incidents').raise({
            key: `lead_unclaimed:${leadId}`, severity: 'P2',
            title: 'Lead went unclaimed through the full agent rotation',
            detail: `No agent claimed it across ${cycleNo} cycle(s) — held for manual handling.`,
            adminLink: '/pages/admin/leads.html',
        });
    } catch (e) { console.warn('[lead-relay.hold]', e.message); }
}

// Advance one lead one step. Opens the first offer when there's none yet;
// otherwise expires the current offer and offers the next eligible agent, looping
// cycles until claimed or held. Returns { action, ... }.
async function advanceLead(leadId) {
    const lead = await leadRouting(leadId);
    if (!lead || lead.deleted_at) return { action: 'gone' };
    if (lead.accepted_at) return { action: 'claimed' };   // someone claimed → stop

    const cur = await ledger.currentOffer(leadId);
    let cycleNo = cur ? cur.cycle_no : 1;
    if (cur) await ledger.closeOffer({ offerId: cur.id, status: 'expired' });

    const geo = { lat: lead.route_lat, lng: lead.route_lng, lakeId: lead.lake_id };
    const routeLead = require('./lead-router').routeLead;

    // Don't re-offer to anyone already offered THIS cycle.
    const excludeUserIds = await agentUserIds(await ledger.offeredThisCycle(leadId, cycleNo));
    let pick = await routeLead({ ...geo, excludeUserIds });

    if (!pick) {
        // Cycle exhausted. Loop to a fresh cycle unless we've hit the cap.
        if (cycleNo >= MAX_CYCLES) { await holdForAdmin(leadId, cycleNo); return { action: 'held' }; }
        cycleNo += 1;
        pick = await routeLead({ ...geo, excludeUserIds: [] });
        if (!pick) { await holdForAdmin(leadId, cycleNo); return { action: 'held' }; }
    }
    await openOffer({ leadId, pick, cycleNo });
    return { action: 'offered', agentId: pick.agentId, userId: pick.userId, cycleNo };
}

// First offer for a freshly-routed lead (behind the flag, from the routing path).
async function openInitialOffer(leadId) { return advanceLead(leadId); }

// The sweep: relay every lead whose window has expired unclaimed. Default-off.
async function runRelaySweep() {
    if (process.env.LEAD_RELAY_ENABLED !== 'true') return { advanced: 0, disabled: true };
    let rows;
    try {
        ({ rows } = await pool.query(
            `SELECT lo.lead_id
               FROM lead_offers lo JOIN leads l ON l.id = lo.lead_id
              WHERE lo.status = 'offered' AND lo.window_expires_at < NOW()
                AND l.accepted_at IS NULL AND l.deleted_at IS NULL
              ORDER BY lo.window_expires_at ASC LIMIT 100`));
    } catch (e) { console.warn('[lead-relay] sweep query:', e.message); return { advanced: 0 }; }
    let advanced = 0;
    for (const r of rows) { try { await advanceLead(r.lead_id); advanced++; } catch (e) { console.warn('[lead-relay]', e.message); } }
    if (advanced) console.log(`[lead-relay] advanced ${advanced} lead(s)`);
    return { advanced };
}

module.exports = { claimWindowSecs, openOffer, advanceLead, openInitialOffer, runRelaySweep, holdForAdmin, MAX_CYCLES };
