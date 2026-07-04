// buyer-nurture.js — a 3-touch re-engagement drip for buyer leads that haven't
// converted yet. Most leads don't act on day one; this keeps warm buyers on the
// platform (and out of Zillow) with genuinely useful nudges instead of letting
// them go cold. Staged by lead age, throttled, unsubscribe-safe (marketing
// category → suppression + footer), and driven by the same periodic sweep the
// other lifecycle emails use.
//
// Disable with NURTURE_ENABLED=false.

const pool = require('../database/pool');
const emailService = require('../services/email');

const SITE = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');

// The sequence: stage N fires once the lead is at least `afterDays` old and the
// previous stage has been sent. Copy is warm, useful, and always CTAs back.
const STAGES = [
    {
        stage: 1, afterDays: 1,
        subject: 'Your Minnesota lake home search — a few next steps',
        build: (d) => `
            <p>Hi ${d.first},</p>
            <p>Thanks for reaching out about lake real estate in Minnesota. Here's how we help you find the right place — and the right local expert:</p>
            <ul>
              <li><strong>Get matched</strong> with a vetted agent who knows your lake bay by bay.</li>
              <li><strong>Save a search</strong> and we'll email you the moment a matching home hits the market.</li>
              <li><strong>Explore by lake</strong> — depth, fishing, market prices and homes for sale, all in one place.</li>
            </ul>
            <p style="margin:1.5rem 0;"><a href="${SITE}/find-your-lake" style="background:#1d6df2;color:#fff;padding:0.8rem 1.4rem;border-radius:10px;text-decoration:none;font-weight:700;">Find your lake →</a></p>
            <p>Just reply to this email if you'd like a hand — a real person will read it.</p>`,
    },
    {
        stage: 2, afterDays: 3,
        subject: 'Homes are moving on Minnesota lakes right now',
        build: (d) => `
            <p>Hi ${d.first},</p>
            <p>Waterfront inventory in Minnesota moves fast — the best homes are often gone in days. A couple of ways to stay ahead:</p>
            <ul>
              <li><strong>Browse current listings</strong> by lake and town.</li>
              <li><strong>Set a price-drop &amp; new-listing alert</strong> so you never miss the right one.</li>
            </ul>
            <p style="margin:1.5rem 0;"><a href="${SITE}/towns?view=props" style="background:#1d6df2;color:#fff;padding:0.8rem 1.4rem;border-radius:10px;text-decoration:none;font-weight:700;">Browse lake homes →</a></p>
            <p>Want us to set the alerts up for you? Just reply with the lake(s) you're watching.</p>`,
    },
    {
        stage: 3, afterDays: 7,
        subject: 'Still looking for the right lake home?',
        build: (d) => `
            <p>Hi ${d.first},</p>
            <p>No rush at all — but when you're ready, the fastest path is a quick chat with your local lake specialist. They can line up showings, share off-market options, and price shoreline correctly.</p>
            ${d.agentLine}
            <p style="margin:1.5rem 0;"><a href="${SITE}/find-your-lake" style="background:#1d6df2;color:#fff;padding:0.8rem 1.4rem;border-radius:10px;text-decoration:none;font-weight:700;">Talk to a lake expert →</a></p>
            <p>If your plans have changed, no problem — you can unsubscribe below and we won't email again.</p>`,
    },
];

function wrap(inner) {
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a202c;line-height:1.6;">
        <div style="padding:1.25rem 0;border-bottom:2px solid #1d6df2;margin-bottom:1.5rem;">
          <span style="font-weight:800;font-size:1.1rem;color:#0b2a10;">Minnesota Lake Homes</span>
        </div>
        ${inner}
        <p style="margin-top:2rem;color:#718096;font-size:0.85rem;">— The Minnesota Lake Homes team</p>
    </div>`;
}

async function runNurtureSweep() {
    if (process.env.NURTURE_ENABLED === 'false') return { sent: 0 };
    try {
        // Candidate buyer-side leads with an email that are still in the pipeline.
        // Eligible when they've reached the next stage's age and it's been >=20h
        // since the last nurture (so a frequent cron can't double-send).
        const { rows } = await pool.query(`
            SELECT id, email, COALESCE(NULLIF(first_name,''), split_part(full_name,' ',1), 'there') AS first,
                   lead_type, lead_status, nurture_stage, assigned_user_id,
                   EXTRACT(EPOCH FROM (NOW() - created_at))/86400 AS age_days
              FROM leads
             WHERE email IS NOT NULL AND email <> ''
               AND deleted_at IS NULL
               AND lead_type IN ('buyer','general_contact','market_report','property_question')
               AND COALESCE(lead_status,'new') NOT IN ('closed','won','lost','do_not_contact')
               AND nurture_stage < 3
               AND (nurture_last_at IS NULL OR nurture_last_at < NOW() - INTERVAL '20 hours')
             ORDER BY created_at ASC
             LIMIT 200`);

        let sent = 0;
        for (const lead of rows) {
            const next = STAGES.find(s => s.stage === lead.nurture_stage + 1);
            if (!next) continue;
            if (Number(lead.age_days) < next.afterDays) continue;

            // Respect the suppression list before composing anything.
            if (typeof emailService.isSuppressed === 'function' && await emailService.isSuppressed(lead.email)) {
                // Mark as fully nurtured so we stop reconsidering them.
                await pool.query(`UPDATE leads SET nurture_stage = 3, nurture_last_at = NOW() WHERE id = $1`, [lead.id]);
                continue;
            }

            // Personalize stage 3 with the assigned agent's name if we have one.
            let agentLine = '';
            if (lead.assigned_user_id) {
                try {
                    const a = await pool.query(
                        `SELECT COALESCE(ag.display_name, u.full_name) AS name
                           FROM users u LEFT JOIN agents ag ON ag.user_id = u.id
                          WHERE u.id = $1 LIMIT 1`, [lead.assigned_user_id]);
                    if (a.rows[0]?.name) agentLine = `<p>You've been matched with <strong>${a.rows[0].name}</strong>, a local specialist ready when you are.</p>`;
                } catch (_) { /* optional */ }
            }

            try {
                await emailService.sendEmail({
                    to: lead.email,
                    subject: next.subject,
                    html: wrap(next.build({ first: lead.first, agentLine })),
                    category: 'marketing',   // suppression check + unsubscribe footer + List-Unsubscribe headers
                });
                await pool.query(
                    `UPDATE leads SET nurture_stage = $1, nurture_last_at = NOW() WHERE id = $2`,
                    [next.stage, lead.id]);
                sent++;
            } catch (e) {
                console.warn(`[buyer-nurture] send failed for lead ${lead.id}:`, e.message);
            }
        }
        if (sent) console.log(`[buyer-nurture] sent ${sent} nurture emails`);
        return { sent };
    } catch (err) {
        console.warn('[buyer-nurture] sweep failed:', err.message);
        return { sent: 0 };
    }
}

module.exports = { runNurtureSweep };
