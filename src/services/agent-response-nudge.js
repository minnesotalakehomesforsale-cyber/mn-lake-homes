'use strict';

// EM-15 — nudge the assigned agent at +1h and +24h after routing if no contact
// has been logged. Speed to first contact is the whole difference between a lead
// and a wasted one. Buttons are tokenised (no login). The +24h nudge also raises
// a P2 so it lands in the weekly. Both nudges stop the moment contact is logged
// (first_contact_at) — the query filters on it and each send re-checks.

const pool = require('../database/pool');
const email = require('./email');
const tokens = require('./action-tokens');
const { sweepCutoff } = require('./sweep-guard');

const money = n => (n == null ? null : (Number(n) >= 1000 ? `$${Math.round(Number(n) / 1000)}k` : `$${Number(n)}`));

async function runAgentResponseNudge() {
    // Backlog guard: the +1h/+24h nudge is meaningless on an old lead — never nudge
    // on anything routed more than 3 days ago, and never replay a backlog on enable.
    const cutoff = await sweepCutoff('agent-response-nudge', { freshnessHours: 24 * 3, staleAfterHours: 3 });
    let rows;
    try {
        ({ rows } = await pool.query(
            `SELECT l.id, l.first_name AS buyer_first, l.email AS buyer_email, l.phone, l.target_lake,
                    l.timeline_text, l.budget_min, l.budget_max, l.intent_type, l.routed_at,
                    l.nudge_1h_at, l.nudge_24h_at, l.agent_id,
                    u.email AS agent_email, u.first_name AS agent_first, COALESCE(a.display_name, u.full_name) AS agent_name
               FROM leads l
               JOIN agents a ON a.id = l.agent_id
               JOIN users u ON u.id = a.user_id
              WHERE l.agent_id IS NOT NULL AND l.first_contact_at IS NULL AND l.deleted_at IS NULL
                AND l.routed_at IS NOT NULL AND l.routed_at >= $1
                -- A PENDING manual offer is on EM-14's own 24h accept clock; never
                -- also nudge it here, or an agent gets "still no contact" and "it
                -- went to another agent" in the same hour (warned + punished at once).
                AND NOT (l.assigned_manually = TRUE AND l.accepted_at IS NULL)
                AND ( (l.nudge_1h_at IS NULL AND l.routed_at < NOW() - INTERVAL '1 hour')
                   OR (l.nudge_24h_at IS NULL AND l.routed_at < NOW() - INTERVAL '24 hours') )
              LIMIT 200`, [cutoff]));
    } catch (e) { console.warn('[agent-nudge] query failed:', e.message); return { sent: 0 }; }

    let sent = 0;
    for (const l of rows) {
        if (!l.agent_email) continue;
        const is24 = l.nudge_24h_at == null && new Date(l.routed_at) < new Date(Date.now() - 24 * 3600e3);
        try {
            // Claim the slot atomically (and re-check contact) so a double-run or a
            // just-logged contact can't double-send. The 24h claim also stamps the
            // 1h slot so a skipped 1h can't fire late + out of order.
            const claim = is24
                ? await pool.query(`UPDATE leads SET nudge_24h_at = NOW(), nudge_1h_at = COALESCE(nudge_1h_at, NOW()) WHERE id = $1 AND nudge_24h_at IS NULL AND first_contact_at IS NULL RETURNING id`, [l.id])
                : await pool.query(`UPDATE leads SET nudge_1h_at = NOW() WHERE id = $1 AND nudge_1h_at IS NULL AND first_contact_at IS NULL RETURNING id`, [l.id]);
            if (!claim.rowCount) continue;

            const markUrl = tokens.actionUrl(await tokens.createToken({ action: 'mark_contacted', leadId: l.id, agentId: l.agent_id }));
            const passUrl = is24 ? tokens.actionUrl(await tokens.createToken({ action: 'pass_back', leadId: l.id, agentId: l.agent_id })) : null;
            const budget = (l.budget_min || l.budget_max) ? [money(l.budget_min), money(l.budget_max)].filter(Boolean).join('–') : null;

            email.sendAgentNudge({
                variant: is24 ? '24h' : '1h', to: l.agent_email, agentFirstName: l.agent_first,
                buyer_first: l.buyer_first, lake_name: l.target_lake, timeline: l.timeline_text,
                budget, intent: l.intent_type, phone: l.phone, markContactedUrl: markUrl, passBackUrl: passUrl,
            });

            if (is24) {
                try {
                    require('./incidents').raise({
                        key: `no_contact_24h:${l.id}`, severity: 'P2',
                        title: `No contact logged 24h after routing — ${l.buyer_first || l.buyer_email}`,
                        detail: `${l.target_lake || 'a lake'} lead assigned to ${l.agent_name}; no contact logged in 24h.`,
                        adminLink: '/pages/admin/leads.html',
                    });
                } catch (_) {}
            }
            sent++;
        } catch (e) { console.warn('[agent-nudge] one failed:', e.message); }
    }
    if (sent) console.log(`[agent-nudge] sent ${sent} nudge(s)`);
    return { sent };
}

module.exports = { runAgentResponseNudge };
