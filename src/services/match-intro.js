'use strict';

// EM-24 — the consumer "you've been matched" intro (the EM-12 concierge handoff)
// as ONE shared call site that EVERY routing mechanism hits: auto-route, manual
// accept, and admin assign. Three code paths that can route a lead are three that
// can drift; this makes the most important message we send fire exactly once per
// routed lead, whichever path routed it.
//
// Idempotent: an atomic claim on leads.match_intro_at guarantees exactly one
// intro per lead even if two paths race.

const pool = require('../database/pool');
const email = require('./email');

async function sendMatchIntro({ leadId, agentId }) {
    if (!leadId || !agentId) return { skipped: true, reason: 'missing_ids' };

    // Claim the single intro for this lead. If another path already sent it, stop.
    const claim = await pool.query(
        `UPDATE leads SET match_intro_at = NOW()
          WHERE id = $1 AND match_intro_at IS NULL
          RETURNING email, first_name, target_lake`, [leadId]);
    if (!claim.rowCount) return { skipped: true, reason: 'already_sent' };
    const lead = claim.rows[0];
    if (!lead.email) return { skipped: true, reason: 'no_email' };

    // Agent profile for the handoff + a couple of nearby lakes they also work.
    const { rows: ag } = await pool.query(
        `SELECT a.user_id, a.display_name, a.brokerage_name, a.phone_public, a.email_public,
                a.profile_photo_url, a.bio, a.city, a.years_experience, a.specialties
           FROM agents a WHERE a.id = $1`, [agentId]);
    const a = ag[0] || {};
    const toArr = v => Array.isArray(v) ? v : (() => { try { return JSON.parse(v || '[]'); } catch (_) { return []; } })();
    const specs = toArr(a.specialties);
    let nearby = null;
    try {
        const { rows: nl } = await pool.query(
            `SELECT l.name FROM lakes l
              WHERE (EXISTS (SELECT 1 FROM lake_tags lt JOIN user_tags ut ON ut.tag_id = lt.tag_id
                              WHERE lt.lake_id = l.id AND ut.user_id = $1)
                     OR EXISTS (SELECT 1 FROM agent_lakes al WHERE al.lake_id = l.id AND al.agent_id = $2))
                AND ($3::text IS NULL OR l.name <> $3)
              ORDER BY l.name LIMIT 3`, [a.user_id, agentId, lead.target_lake || null]);
        if (nl.length) nearby = nl.map(r => r.name).join(', ');
    } catch (_) {}

    const fullName = a.display_name || '';
    await email.sendLeadAgentMatched({
        to:               lead.email,
        lead_first_name:  lead.first_name,
        agent_full_name:  fullName,
        agent_first_name: fullName.split(' ')[0],
        brokerage:        a.brokerage_name,
        lake_name:        lead.target_lake,
        town:             a.city,
        agent_bio:        a.bio,
        years_experience: a.years_experience,
        nearby_lakes:     nearby,
        agent_phone:      a.phone_public,
        agent_email:      a.email_public,
        photo_url:        a.profile_photo_url,
        specialty:        specs.length ? ('specializes in ' + specs.slice(0, 3).join(', ')) : null,
    });
    return { sent: true };
}

module.exports = { sendMatchIntro };
