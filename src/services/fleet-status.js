'use strict';

// Boot-time inventory of the background worker fleet. A sweep that silently
// no-ops is how a worker runs — or fails to run — unnoticed for weeks; this
// prints, in one glance, exactly which workers are live and which are held off.
//
// INVARIANT (mirrors the gates in server.js): everything that SENDS to a
// customer, agent, or the owner is default-OFF and requires `=true`. The only
// default-ON workers are the alarm layer, which alerts us — it doesn't market.
// When you add a worker to the fleet in server.js, add it here too so the boot
// log stays honest.

// [envVar, humanLabel] — a sender is ON only when its var === 'true'.
const SENDERS = [
    ['LEAD_SLA_ENABLED',            'lead SLA re-route sweep'],
    ['NO_AGENT_FOLLOWUP_ENABLED',   'held-lead 7-day follow-up'],
    ['AGENT_NUDGE_ENABLED',         'agent response nudge (+1h/+24h)'],
    ['FEEDBACK_REQUEST_ENABLED',    '72h buyer feedback check-in'],
    ['LADDER_ENABLED',              'content ladder sweep'],
    ['WEEKLY_REPORT_ENABLED',       'weekly + periodic owner report'],
    ['MANUAL_RELEASE_SWEEP_ENABLED','manual-release acceptance SLA'],
    ['LEAD_RECOVERY_ENABLED',       'lead recovery / retry sweep'],
    ['ROUTING_SLA_REPORT_ENABLED',  'routing SLA weekly report'],
    ['PROFILE_NUDGE_ENABLED',       'profile completion nudge + DFY SMS'],
    ['ACQ_MAINTENANCE_ENABLED',     'HubSpot deal maintenance (no email)'],
    ['DNR_ENRICH_ENABLED',          'DNR lake enrichment (no email)'],
];

// The alarm layer — ON unless explicitly set to 'false'. Alerts us, never markets.
const ALARMS = [
    ['INCIDENT_ROUTER_ENABLED',       'incident router / P2 digest'],
    ['EMAIL_HEALTH_MONITOR_ENABLED',  'send-health monitor'],
];

function senderOn(env, v) { return env[v] === 'true'; }
function alarmOn(env, v) { return env[v] !== 'false'; }

// Build the boot-log lines. Pure function of env so it can be printed anywhere.
function fleetStatusLines(env = process.env) {
    const lines = [];
    lines.push('── Worker fleet ─────────────────────────────────────────────');
    const onCount = SENDERS.filter(([v]) => senderOn(env, v)).length;
    lines.push(`   Senders (default-OFF — set =true to enable): ${onCount}/${SENDERS.length} on`);
    for (const [v, label] of SENDERS) {
        const on = senderOn(env, v);
        lines.push(`     ${on ? 'ON ' : 'off'}  ${v}  — ${label}`);
    }
    lines.push('   Alarm layer (default-ON — alerts, never markets):');
    for (const [v, label] of ALARMS) {
        const on = alarmOn(env, v);
        lines.push(`     ${on ? 'ON ' : 'off'}  ${v}  — ${label}`);
    }
    lines.push('─────────────────────────────────────────────────────────────');
    return lines;
}

function logFleetStatus(env = process.env, sink = console.log) {
    for (const l of fleetStatusLines(env)) sink(l);
}

module.exports = { fleetStatusLines, logFleetStatus, SENDERS, ALARMS };

// Standalone: `node src/services/fleet-status.js` prints the fleet state for the
// current environment without booting the server or touching the database.
if (require.main === module) logFleetStatus();
