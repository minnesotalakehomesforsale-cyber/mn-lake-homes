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
pool.query = async (sql) => (/email_unsubscribes|COUNT/.test(sql) ? { rows: [{ n: 0 }] } : { rows: [] });

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
        agent_bio: 'Dana has helped families find lake homes across the Brainerd Lakes for over a decade.',
        years_experience: 12, nearby_lakes: 'North Long Lake, Round Lake', agent_phone: '218-555-0100',
        agent_email: 'dana@northland.com', photo_url: null, specialty: 'specializes in waterfront and cabins',
    }));

    // EM-13 — no agent on your lake yet (initial + 7-day follow-up)
    await dump('EM-13_no-agent_initial', () => email.sendNoAgentYet({ to: 'buyer@x.com', first_name: 'Sam', lake_name: 'Gull Lake', lake_slug: 'gull-lake', nearby_lakes: ['North Long Lake', 'Round Lake'] }));
    await dump('EM-13_no-agent_followup', () => email.sendNoAgentYet({ to: 'buyer@x.com', first_name: 'Sam', lake_name: 'Gull Lake', lake_slug: 'gull-lake', nearby_lakes: ['North Long Lake', 'Round Lake'], variant: 'followup' }));

    console.log('Done.');
})();
