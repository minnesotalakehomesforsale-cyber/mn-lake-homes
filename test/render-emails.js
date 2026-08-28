'use strict';

// Block C/D review artefact. The sandbox still blocks live sending, so these
// consumer-facing emails would land green in tests and unseen in an inbox. This
// renders each one's HTML + plain text to _email-previews/ so the copy can be
// read and corrected without waiting on the Render/EMAIL_FROM blocker.
//
//   node test/render-emails.js   → writes _email-previews/*.html + *.txt

process.env.EMAIL_PHYSICAL_ADDRESS = process.env.EMAIL_PHYSICAL_ADDRESS || 'MN Lake Homes, 123 Example St, Brainerd, MN 56401';
process.env.RESEND_API_KEY = 'preview';
process.env.SITE_URL = 'https://minnesotalakehomesforsale.com';

const fs = require('fs');
const path = require('path');

// Capture the rendered payload instead of sending.
const resendMod = require('resend');
let captured = null;
resendMod.Resend = class { constructor() { this.emails = { send: async (p) => { captured = p; return { data: { id: 'preview' } }; } }; } };

// Quiet pool — templates don't hit it, but suppression/cap checks might.
const pool = require('../src/database/pool');
pool.query = async (sql) => {
    if (/email_unsubscribes/.test(sql)) return { rows: [] };   // not suppressed
    if (/COUNT/.test(sql)) return { rows: [{ n: 0 }] };          // frequency cap = 0
    return { rows: [] };
};

const email = require('../src/services/email');
const OUT = path.join(__dirname, '..', '_email-previews');
fs.mkdirSync(OUT, { recursive: true });

async function dump(name, fn) {
    captured = null;
    await fn();
    if (!captured) { console.warn(`  ! ${name}: nothing captured`); return; }
    fs.writeFileSync(path.join(OUT, `${name}.html`), captured.html || '');
    fs.writeFileSync(path.join(OUT, `${name}.txt`), `SUBJECT: ${captured.subject}\n\n${captured.text || ''}`);
    console.log(`  ✓ ${name}  —  ${captured.subject}`);
}

const AGENT = { display_name: 'Dana Smith', slug: 'dana-smith' };

(async () => {
    console.log('Rendering email previews → _email-previews/');

    // EM-10 — agent welcome (single + several lakes)
    await dump('EM-10_agent-welcome_one-lake', () => email.sendAgentWelcome({ email: 'a@x.com', display_name: AGENT.display_name, lake_name: 'Gull Lake', lake_count: 1 }));
    await dump('EM-10_agent-welcome_several', () => email.sendAgentWelcome({ email: 'a@x.com', display_name: AGENT.display_name, lake_name: null, lake_count: 3 }));

    // EM-11 — profile live (paid + free)
    await dump('EM-11_profile-live_paid', () => email.sendAgentProfileLive({ email: 'a@x.com', display_name: AGENT.display_name, slug: AGENT.slug, tier: 'paid', lake_name: 'Gull Lake', lake_slug: 'gull-lake' }));
    await dump('EM-11_profile-live_free', () => email.sendAgentProfileLive({ email: 'a@x.com', display_name: AGENT.display_name, slug: AGENT.slug, tier: 'free', lake_name: 'Gull Lake', lake_slug: 'gull-lake' }));

    // EM-24/EM-12 — the concierge match handoff (buyer)
    await dump('EM-24_match-intro', () => email.sendLeadAgentMatched({
        to: 'buyer@x.com', lead_first_name: 'Sam', agent_full_name: 'Dana Smith', agent_first_name: 'Dana',
        brokerage: 'Northland Realty', lake_name: 'Gull Lake', town: 'Nisswa',
        agent_bio: 'Dana helps families find lake homes across the Brainerd Lakes area.',
        years_experience: 12, nearby_lakes: 'North Long Lake, Round Lake', agent_phone: '218-555-0100',
        agent_email: 'dana@northland.com', photo_url: null, specialty: 'specializes in waterfront and cabins',
    }));

    // EM-13 — no agent on your lake yet (initial + 7-day follow-up)
    await dump('EM-13_no-agent_initial', () => email.sendNoAgentYet({ to: 'buyer@x.com', first_name: 'Sam', lake_name: 'Gull Lake', lake_slug: 'gull-lake', nearby_lakes: ['North Long Lake', 'Round Lake'] }));
    await dump('EM-13_no-agent_followup', () => email.sendNoAgentYet({ to: 'buyer@x.com', first_name: 'Sam', lake_name: 'Gull Lake', lake_slug: 'gull-lake', nearby_lakes: ['North Long Lake', 'Round Lake'], variant: 'followup' }));

    // EM-15 — agent response nudge (+1h, +24h)
    const mk = 'https://minnesotalakehomesforsale.com/a/EXAMPLETOKEN1';
    const pb = 'https://minnesotalakehomesforsale.com/a/EXAMPLETOKEN2';
    await dump('EM-15_agent-nudge_1h', () => email.sendAgentNudge({ variant: '1h', to: 'agent@x.com', agentFirstName: 'Dana', buyer_first: 'Sam', lake_name: 'Gull Lake', timeline: 'this summer', budget: '$300k–$450k', intent: 'buying', phone: '218-555-0100', markContactedUrl: mk }));
    await dump('EM-15_agent-nudge_24h', () => email.sendAgentNudge({ variant: '24h', to: 'agent@x.com', agentFirstName: 'Dana', buyer_first: 'Sam', lake_name: 'Gull Lake', markContactedUrl: mk, passBackUrl: pb }));

    // EM-16 — did they reach out? (72h buyer check-in)
    await dump('EM-16_did-they-reach-out', () => email.sendDidTheyReachOut({ to: 'buyer@x.com', first_name: 'Sam', agent_full_name: 'Dana Smith', yesUrl: mk, notYetUrl: pb, pausedUrl: 'https://minnesotalakehomesforsale.com/a/EXAMPLETOKEN3' }));

    // EM-14 — offer expired, rerouting (buyer + agent)
    await dump('EM-14_reroute_buyer', () => email.sendRerouteBuyer({ to: 'buyer@x.com', first_name: 'Sam', lake_name: 'Gull Lake' }));
    await dump('EM-14_reroute_agent', () => email.sendRerouteAgent({ to: 'agent@x.com', agentFirstName: 'Dana', buyer_first: 'Sam', lake_name: 'Gull Lake', timeline: 'this summer', windowHours: 24 }));

    // Block E — ladder rungs (content-ask; note the content-ask footer + usage grant)
    const rt = 'replies+EXAMPLE.0000000000000000@reply.minnesotalakehomesforsale.com';
    await dump('EM-18_ladder-1-photos', () => email.sendLadderPhotos({ to: 'agent@x.com', first_name: 'Dana', lake_name: 'Gull Lake', replyTo: rt }));
    await dump('EM-19_ladder-2-question', () => email.sendLadderQuestion({ to: 'agent@x.com', first_name: 'Dana', lake_name: 'Gull Lake', replyTo: rt }));
    await dump('EM-20_ladder-4-featured', () => email.sendLadderFeatured({ to: 'agent@x.com', first_name: 'Dana', lake_name: 'Gull Lake', contributed: 'photos', lake_url: 'https://minnesotalakehomesforsale.com/lakes/gull-lake', replyTo: rt }));

    // EM-08 — weekly website report (rich sample + zero-activity sample)
    const sampleReport = {
        numbers: {
            current: { sessions: 412, lake_views: 214, leads_submitted: 3, leads_routed: 2, leads_unrouted: 1, completion_rate: null, median_ttc_min: 34, new_agents: 1, profiles_published: 1, new_businesses: 0, paid_conversions: 1, cancellations: 0 },
            previous: { sessions: 380, lake_views: 190, leads_submitted: 2, leads_routed: 2, leads_unrouted: 0, completion_rate: null, median_ttc_min: 51, new_agents: 0, profiles_published: 0, new_businesses: 1, paid_conversions: 0, cancellations: 0 },
            avg: { sessions: 395, lake_views: 200, leads_submitted: 2, leads_routed: 2, leads_unrouted: 1, completion_rate: null, median_ttc_min: 42, new_agents: 1, profiles_published: 1, new_businesses: 0, paid_conversions: 1, cancellations: 0 },
        },
        mrr: 87,
        topLakes: [{ lake: 'gull-lake', views: 96 }, { lake: 'north-long-lake', views: 44 }],
        leads: [{ lake: 'Gull Lake', agent: 'Dana Smith', accepted_at: '2026-08-25', routed_at: '2026-08-25T10:00:00Z', first_contact_at: '2026-08-25T10:34:00Z' }, { lake: 'Round Lake', agent: null, accepted_at: null, routed_at: null, first_contact_at: null }],
        content: { pages_published: 1, blog_live: 51, agent_replies: 2 },
        whatRan: { open_incidents: 0, bounce_rate: 0, emailsByTemplate: [{ template_key: 'lead_agent_matched', sent: 2 }, { template_key: 'agent_welcome', sent: 1 }], sweeps: [{ name: 'lead-sla', last_run_at: '2026-08-24' }, { name: 'email-health', last_run_at: '2026-08-24' }] },
    };
    const sampleActions = [
        { text: 'You had 1 lead on a lake with no agent — Round Lake', link: '/pages/admin/leads.html' },
        { text: 'Recruit an agent on Bald Eagle Lake — 96 views last month, nobody to send them to', link: '/pages/admin/agents.html' },
        { text: 'North Long Lake has an agent and almost no content — it\'s the page most likely to convert if you fix it', link: '/pages/admin/lakes-towns.html' },
    ];
    await dump('EM-08_weekly-report', () => email.sendWeeklyReport({ subject: 'MN Lake Homes — week of Aug 24', statusLine: 'All systems normal — 3 emails sent, no incidents.', report: sampleReport, actions: sampleActions }));
    await dump('EM-08_weekly-report_quiet', () => email.sendWeeklyReport({ subject: 'MN Lake Homes — week of Aug 24', statusLine: 'All systems normal — 0 emails sent, no incidents.', report: { numbers: { current: {}, previous: {}, avg: {} }, mrr: null, topLakes: [], leads: [], content: {}, whatRan: { open_incidents: 0, emailsByTemplate: [], sweeps: [] } }, actions: [] }));

    console.log('Done.');
})();
