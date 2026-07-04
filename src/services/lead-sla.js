// lead-sla.js — Lead response SLA + auto-reassign.
//
// A lead assigned to an agent starts a clock (leads.assigned_at). The agent
// "acks" it by taking any action — changing its status or adding a note
// (leads.agent_ack_at). If the SLA window passes with no ack, the lead is
// re-routed to the next eligible agent (excluding everyone who's already had
// it), the new agent + admin are emailed, and the clock resets. After a few
// hops with nobody working it, we stop and flag it for manual admin handling.
//
// Driven by a periodic sweep (setInterval in server.js) — no external cron.
const pool = require('../database/pool');
const emailService = require('./email');
const { routeLead } = require('./lead-router');
const { geocodeAddress } = require('./geocoder');
const { logActivity } = require('./activity-log');

const MAX_REASSIGNS = 3;         // hops before we give up and ask admin to step in
const DEFAULT_SLA_HOURS = 4;

async function getSlaHours() {
    try {
        const { rows } = await pool.query(`SELECT value FROM app_config WHERE key = 'lead_sla_hours'`);
        const raw = rows[0]?.value;
        const n = Number(typeof raw === 'string' ? JSON.parse(raw) : raw);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_SLA_HOURS;
    } catch (_) { return DEFAULT_SLA_HOURS; }
}

// Best-effort coordinates for re-routing: geocode the stored property address.
async function coordsFor(lead) {
    const addr = [lead.property_street, lead.property_city, lead.property_state, lead.property_zip]
        .filter(Boolean).join(', ');
    if (!addr) return null;
    try { return await geocodeAddress(addr); } catch (_) { return null; }
}

async function reassignOne(lead) {
    const prevUserId = lead.assigned_user_id;
    const tried = Array.isArray(lead.sla_tried_user_ids) ? lead.sla_tried_user_ids : [];
    const exclude = [...tried, prevUserId].filter(Boolean);

    const geo = await coordsFor(lead);
    const pick = await routeLead({
        lat: geo?.lat, lng: geo?.lng, lakeId: lead.lake_id || null, excludeUserIds: exclude,
    });

    if (!pick) {
        // Nobody else to hand it to — stop retrying and alert admin once.
        await pool.query(
            `UPDATE leads SET sla_reassign_count = $1, updated_at = NOW() WHERE id = $2`,
            [MAX_REASSIGNS, lead.id]);
        logActivity({
            event_type: 'lead.sla.unrouted', event_scope: 'lead', severity: 'warning',
            actor: { type: 'system', label: 'lead-sla' },
            target: { type: 'lead', id: lead.id, label: lead.name },
            details: { reason: 'no_other_eligible_agent', tried: exclude },
        });
        emailService.sendAdminLeadNotification({
            name: lead.name, first_name: (lead.name || '').split(' ')[0],
            email: lead.email, phone: lead.phone, type: lead.lead_type,
            source: `${lead.lead_source || 'lead'} · SLA UNWORKED`,
            notes: `This lead went unworked past the response window and there is no other eligible agent to route it to. Please handle it manually from the admin Leads queue.\n\n${lead.notes || ''}`.trim(),
        });
        return false;
    }

    await pool.query(
        `UPDATE leads
            SET agent_id           = $1,
                assigned_user_id   = $2,
                assigned_at        = NOW(),
                agent_ack_at       = NULL,
                lead_status        = 'contacted',
                sla_reassign_count = sla_reassign_count + 1,
                sla_tried_user_ids = array_append(sla_tried_user_ids, $3::uuid),
                updated_at         = NOW()
          WHERE id = $4`,
        [pick.agentId, pick.userId, prevUserId, lead.id]);

    if (pick.email) {
        emailService.sendMatchedAgentNotification({
            to: pick.email,
            agentFirstName: (pick.fullName || '').split(' ')[0] || 'there',
            lead: {
                id: lead.id, name: lead.name, email: lead.email, phone: lead.phone,
                notes: lead.notes, type: lead.lead_type, source: lead.lead_source,
                address: geo?.formattedAddress || [lead.property_street, lead.property_city].filter(Boolean).join(', ') || pick.lakeName || null,
            },
            distanceMiles: pick.distanceMiles,
            matchedAreas: [pick.lakeName || pick.tagName].filter(Boolean),
        });
    }
    logActivity({
        event_type: 'lead.sla.reassigned', event_scope: 'lead',
        actor: { type: 'system', label: 'lead-sla' },
        target: { type: 'lead', id: lead.id, label: lead.name },
        details: { from_user: prevUserId, to_user: pick.userId, to_agent: pick.agentId, hop: (lead.sla_reassign_count || 0) + 1 },
    });
    return true;
}

// Find stale, un-acked leads and re-route them. Called on an interval.
async function runSlaSweep() {
    if (process.env.LEAD_SLA_ENABLED === 'false') return { scanned: 0, reassigned: 0 };
    const hours = await getSlaHours();
    let reassigned = 0;
    try {
        const { rows } = await pool.query(
            `SELECT l.id, l.full_name AS name, l.email, l.phone, l.message AS notes,
                    l.lead_type, l.lead_source, l.assigned_user_id, l.agent_id, l.lake_id,
                    l.property_street, l.property_city, l.property_state, l.property_zip,
                    l.sla_reassign_count, l.sla_tried_user_ids
               FROM leads l
              WHERE l.agent_ack_at IS NULL
                AND l.assigned_user_id IS NOT NULL
                AND l.assigned_at IS NOT NULL
                AND l.assigned_at < NOW() - ($1 || ' hours')::interval
                AND l.lead_status NOT IN ('closed', 'archived')
                AND l.deleted_at IS NULL
                AND l.sla_reassign_count < $2
              ORDER BY l.assigned_at ASC
              LIMIT 50`,
            [String(hours), MAX_REASSIGNS]);
        for (const lead of rows) {
            try { if (await reassignOne(lead)) reassigned++; }
            catch (e) { console.warn('[lead-sla] reassign failed for', lead.id, e.message); }
        }
        if (rows.length) console.log(`[lead-sla] swept ${rows.length} stale lead(s), reassigned ${reassigned} (SLA ${hours}h)`);
        return { scanned: rows.length, reassigned };
    } catch (e) {
        console.warn('[lead-sla] sweep failed:', e.message);
        return { scanned: 0, reassigned: 0, error: e.message };
    }
}

module.exports = { runSlaSweep, getSlaHours, MAX_REASSIGNS };
