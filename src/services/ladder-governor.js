'use strict';

// EM-17 — the content-ladder governor. Built before the rungs; it's what keeps
// the ladder from becoming spam. Pure decision function over an agent's ladder
// state + when their profile published; the sweep acts on what it returns.
//
// Rules:
//  - Rungs run in order 1 → 2 → 4 (3/5/6 are out of scope this sprint).
//  - Each rung targets a day after publish (1: day 5, 2: day 12, 4: day 21).
//  - One rung per agent per 7 days (on top of the global frequency cap).
//  - Never send rung N+1 if rung N got NO response. Instead wait 30 days, re-send
//    rung N once, then stop that agent's ladder permanently.
//  - Any reply of any kind counts as a response (recorded via the inbound hook).
//  - Skip an agent who contributed anything in the last 30 days — don't ask for a
//    second favour while we're still publishing the first.

const RUNGS = [1, 2, 4];
const RUNG_DAY = { 1: 5, 2: 12, 4: 21 };
const DAY = 864e5;

function nextLadderAction(agent, publishedAt, now = Date.now()) {
    if (!publishedAt) return { action: 'wait', reason: 'not_published' };
    if (agent.ladder_status === 'stopped') return { action: 'wait', reason: 'stopped' };

    const t = v => v ? new Date(v).getTime() : null;
    const daysSincePublish = (now - t(publishedAt)) / DAY;
    const daysSinceRung = t(agent.last_rung_sent_at) ? (now - t(agent.last_rung_sent_at)) / DAY : Infinity;
    const daysSinceContribution = t(agent.last_contribution_at) ? (now - t(agent.last_contribution_at)) / DAY : Infinity;
    const rung = agent.ladder_rung || 0;
    // Responded to the CURRENT rung = a reply landed at/after it was last sent.
    const responded = t(agent.last_response_at) && (!t(agent.last_rung_sent_at) || t(agent.last_response_at) >= t(agent.last_rung_sent_at));

    // One rung per 7 days.
    if (daysSinceRung < 7) return { action: 'wait', reason: '7day_cap' };
    // Don't stack a new ask on top of a contribution we're still publishing.
    if (daysSinceContribution < 30) return { action: 'wait', reason: 'recent_contribution' };

    // No rung sent yet → rung 1 at its day target.
    if (rung === 0) {
        return daysSincePublish >= RUNG_DAY[1] ? { action: 'send', rung: 1 } : { action: 'wait', reason: 'too_early' };
    }

    if (responded) {
        const next = RUNGS[RUNGS.indexOf(rung) + 1];
        if (!next) return { action: 'wait', reason: 'ladder_complete' };
        return daysSincePublish >= RUNG_DAY[next] ? { action: 'send', rung: next } : { action: 'wait', reason: 'too_early_next' };
    }

    // No response to the last rung. Wait 30 days, re-send once, then stop.
    if (!agent.last_rung_resent) {
        return daysSinceRung >= 30 ? { action: 'resend', rung } : { action: 'wait', reason: 'awaiting_response' };
    }
    return daysSinceRung >= 30 ? { action: 'stop', rung } : { action: 'wait', reason: 'awaiting_response_after_resend' };
}

module.exports = { nextLadderAction, RUNGS, RUNG_DAY };
