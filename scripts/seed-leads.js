/**
 * seed-leads.js
 * Seeds 15 realistic test leads across all types/statuses,
 * some assigned to agents so they appear in agent dashboards.
 *
 * Run: node scripts/seed-leads.js
 */

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

// ─── Agent IDs (from seed-agents.js) ────────────────────────────────────────
const AGENTS = {
    david:  'c1255095-03e9-4cbf-abc6-d5fccb50d72b',  // David Chen
    sarah:  'd6e73b8d-d15d-4d8b-ad40-88352b0d3e7f',  // Sarah Jenkins
    marcus: '7737b819-cf0c-4751-870a-6bf00f27f8f6',  // Marcus Washington
};

// ─── Leads Data ──────────────────────────────────────────────────────────────
const leads = [
    // ── BUYER LEADS ────────────────────────────────────────────────────────
    {
        full_name: 'James & Kelly Hartman',
        first_name: 'James',
        email: 'jhartman@email.com',
        phone: '612-555-0142',
        message: "We're relocating from Chicago and looking for a lake home on Mille Lacs. Budget is flexible around $600k–$800k. Would love something with a dock and 4+ bedrooms for the kids. Can we schedule a call this week?",
        lead_type: 'buyer',
        lead_source: 'buyer',
        lead_status: 'in_progress',
        agent_id: AGENTS.david,
        budget_min: 600000,
        budget_max: 800000,
        timeline_text: '3–6 months',
        location_text: 'Mille Lacs Lake area',
        contact_preference: 'phone',
        source_page_url: '/pages/public/buy.html',
        source_page_title: 'Buy a Lake Home',
        days_ago: 2,
    },
    {
        full_name: 'Patricia Novak',
        first_name: 'Patricia',
        email: 'patricia.novak@outlook.com',
        phone: '651-555-0278',
        message: "I've been renting on the lake for years and I'm finally ready to buy. Looking for something on Gull Lake under $450k. Just me and my dog — a cabin-style 2BR would be perfect. Very motivated buyer.",
        lead_type: 'buyer',
        lead_source: 'buyer',
        lead_status: 'assigned',
        agent_id: AGENTS.sarah,
        budget_min: 300000,
        budget_max: 450000,
        timeline_text: '1–3 months',
        location_text: 'Gull Lake',
        contact_preference: 'email',
        source_page_url: '/pages/public/buy.html',
        source_page_title: 'Buy a Lake Home',
        days_ago: 5,
    },
    {
        full_name: 'Robert & Diane Schultz',
        first_name: 'Robert',
        email: 'rschultz1959@gmail.com',
        phone: '763-555-0391',
        message: "We're retiring next year and want to make the move to a permanent lake home. Looking at Lake Minnetonka or White Bear Lake. Budget up to $1.2M. We want turnkey — updated kitchen, finished basement, garage.",
        lead_type: 'buyer',
        lead_source: 'buyer',
        lead_status: 'new',
        agent_id: null,
        budget_min: 900000,
        budget_max: 1200000,
        timeline_text: '6–12 months',
        location_text: 'Lake Minnetonka or White Bear Lake',
        contact_preference: 'phone',
        source_page_url: '/pages/public/buy.html',
        source_page_title: 'Buy a Lake Home',
        days_ago: 1,
    },
    {
        full_name: 'Tyler Brandt',
        first_name: 'Tyler',
        email: 'tbrandt@hotmail.com',
        phone: null,
        message: "First-time buyer, looking for a starter lake cabin. Something in the $250k–$350k range on a smaller lake. Don't need a lot of space, just want access to the water.",
        lead_type: 'buyer',
        lead_source: 'buyer',
        lead_status: 'unassigned',
        agent_id: null,
        budget_min: 250000,
        budget_max: 350000,
        timeline_text: 'Flexible, within a year',
        location_text: 'Open to suggestions',
        contact_preference: 'email',
        source_page_url: '/pages/public/buy.html',
        source_page_title: 'Buy a Lake Home',
        days_ago: 8,
    },

    // ── SELLER LEADS ───────────────────────────────────────────────────────
    {
        full_name: 'Margaret Olson',
        first_name: 'Margaret',
        email: 'margaretolson@yahoo.com',
        phone: '218-555-0104',
        message: "Looking to list our cabin on Lake Vermilion. It's been in the family for 40 years but my husband and I are downsizing. 3BR, 1.5 bath, private dock, about 1,800 sq ft. We'd like a market analysis to start.",
        lead_type: 'seller',
        lead_source: 'seller',
        lead_status: 'in_progress',
        agent_id: AGENTS.marcus,
        budget_min: null,
        budget_max: null,
        timeline_text: 'Spring listing, 2–3 months',
        location_text: 'Lake Vermilion',
        contact_preference: 'phone',
        source_page_url: '/pages/public/sell.html',
        source_page_title: 'Sell Your Lake Home',
        days_ago: 3,
    },
    {
        full_name: 'Greg & Tammy Lindström',
        first_name: 'Greg',
        email: 'glindstrom@comcast.net',
        phone: '952-555-0467',
        message: "We need to sell our Minnetonka property quickly — job relocation out of state. 4BR lakefront, updated 2021, asking around $1.1M. Can someone call us ASAP? We're motivated.",
        lead_type: 'seller',
        lead_source: 'seller',
        lead_status: 'assigned',
        agent_id: AGENTS.sarah,
        budget_min: null,
        budget_max: null,
        timeline_text: 'ASAP, 30–60 days',
        location_text: 'Lake Minnetonka',
        contact_preference: 'phone',
        source_page_url: '/pages/public/sell.html',
        source_page_title: 'Sell Your Lake Home',
        days_ago: 4,
    },
    {
        full_name: 'Carol Bergstrom',
        first_name: 'Carol',
        email: 'cbergstrom55@gmail.com',
        phone: '320-555-0813',
        message: "Inherited a lake property on Lake Mille Lacs from my parents. It needs some work but has great bones. I'm not sure if I should sell as-is or renovate first. Looking for guidance from an agent who knows the area.",
        lead_type: 'seller',
        lead_source: 'seller',
        lead_status: 'new',
        agent_id: null,
        budget_min: null,
        budget_max: null,
        timeline_text: 'Not urgent, just exploring',
        location_text: 'Mille Lacs Lake',
        contact_preference: 'email',
        source_page_url: '/pages/public/sell.html',
        source_page_title: 'Sell Your Lake Home',
        days_ago: 0,
    },

    // ── AGENT INQUIRIES ────────────────────────────────────────────────────
    {
        full_name: 'Brandon Kim',
        first_name: 'Brandon',
        email: 'brandonkim.re@gmail.com',
        phone: '612-555-0559',
        message: "I've been a licensed agent in Wisconsin for 6 years and I'm looking to expand into the Minnesota lake market. Interested in joining your platform. Can someone reach out about the membership options?",
        lead_type: 'agent_inquiry',
        lead_source: 'agent_inquiry',
        lead_status: 'in_progress',
        agent_id: null,
        budget_min: null,
        budget_max: null,
        timeline_text: null,
        location_text: null,
        contact_preference: 'email',
        source_page_url: '/pages/public/agents.html',
        source_page_title: 'Find an Agent',
        days_ago: 6,
    },
    {
        full_name: 'Lisa Fontaine',
        first_name: 'Lisa',
        email: 'lfontaine.realtor@outlook.com',
        phone: '651-555-0732',
        message: "Just got my MN real estate license and specializing in lake properties is my goal. Your platform looks like exactly what I need. What does the onboarding process look like and what are the costs?",
        lead_type: 'agent_inquiry',
        lead_source: 'agent_inquiry',
        lead_status: 'new',
        agent_id: null,
        budget_min: null,
        budget_max: null,
        timeline_text: null,
        location_text: null,
        contact_preference: 'phone',
        source_page_url: '/pages/public/agents.html',
        source_page_title: 'Find an Agent',
        days_ago: 1,
    },

    // ── GENERAL CONTACT ────────────────────────────────────────────────────
    {
        full_name: 'Susan & Mike Daly',
        first_name: 'Susan',
        email: 'smdaly@gmail.com',
        phone: '763-555-0284',
        message: "We're just starting to explore buying a lake home sometime in the next couple years. Not in a rush at all. Can you send us a market report for the Brainerd Lakes area? We'd love to stay informed.",
        lead_type: 'general_contact',
        lead_source: 'market_report',
        lead_status: 'closed',
        agent_id: AGENTS.david,
        budget_min: null,
        budget_max: null,
        timeline_text: '2+ years out',
        location_text: 'Brainerd Lakes area',
        contact_preference: 'email',
        source_page_url: '/index.html',
        source_page_title: 'MN Lake Homes',
        days_ago: 30,
    },
    {
        full_name: 'Noah Peterson',
        first_name: 'Noah',
        email: 'noahp1987@icloud.com',
        phone: '507-555-0619',
        message: "General question about property taxes on lake homes in Minnesota vs Wisconsin. Also curious if there are any seasonal restrictions on docks in certain lakes. Just doing research right now.",
        lead_type: 'property_question',
        lead_source: 'property_question',
        lead_status: 'assigned',
        agent_id: AGENTS.marcus,
        budget_min: null,
        budget_max: null,
        timeline_text: null,
        location_text: null,
        contact_preference: 'email',
        source_page_url: '/index.html',
        source_page_title: 'MN Lake Homes',
        days_ago: 12,
    },
    {
        full_name: 'Caitlin Rowe',
        first_name: 'Caitlin',
        email: 'caitlin.rowe@me.com',
        phone: '952-555-0351',
        message: "Hi! I'm interested in renting a lake cabin for the summer before committing to a purchase. Do you help with rentals, or strictly sales? If sales only, I'd still love to talk about what's available in the $500k range.",
        lead_type: 'general_contact',
        lead_source: 'general_contact',
        lead_status: 'unassigned',
        agent_id: null,
        budget_min: 400000,
        budget_max: 500000,
        timeline_text: 'Looking to rent summer, maybe buy after',
        location_text: null,
        contact_preference: 'email',
        source_page_url: '/pages/public/rent.html',
        source_page_title: 'Rent a Lake Home',
        days_ago: 2,
    },

    // ── MORE ASSIGNED TO AGENTS (richer agent dashboards) ─────────────────
    {
        full_name: 'Daniel Sorensen',
        first_name: 'Daniel',
        email: 'd.sorensen@gmail.com',
        phone: '218-555-0197',
        message: "Reached out to David via your website. Looking for a 5-bedroom lake home on Leech Lake — want room for the whole extended family. Budget around $750k. Very serious buyer, pre-approved already.",
        lead_type: 'buyer',
        lead_source: 'agent_inquiry',
        lead_status: 'in_progress',
        agent_id: AGENTS.david,
        budget_min: 650000,
        budget_max: 750000,
        timeline_text: '1–2 months',
        location_text: 'Leech Lake',
        contact_preference: 'phone',
        source_page_url: '/pages/public/agent-profile.html',
        source_page_title: 'Agent Profile — David Chen',
        days_ago: 7,
    },
    {
        full_name: 'Jennifer & Craig Walters',
        first_name: 'Jennifer',
        email: 'jwalters_home@gmail.com',
        phone: '651-555-0044',
        message: "Sarah was recommended to us by a friend. We're empty nesters looking to downsize from our suburban home and buy a permanent lakefront residence. Budget $600k–$900k. Would love a walkout basement and west-facing sunset views.",
        lead_type: 'buyer',
        lead_source: 'agent_inquiry',
        lead_status: 'assigned',
        agent_id: AGENTS.sarah,
        budget_min: 600000,
        budget_max: 900000,
        timeline_text: '3–6 months',
        location_text: 'Open — prefer Brainerd or Minnetonka',
        contact_preference: 'phone',
        source_page_url: '/pages/public/agent-profile.html',
        source_page_title: 'Agent Profile — Sarah Jenkins',
        days_ago: 9,
    },
    {
        full_name: 'Antoine Williams',
        first_name: 'Antoine',
        email: 'awilliams.mn@gmail.com',
        phone: '612-555-0876',
        message: "Found Marcus through your platform. I'm an investor looking to acquire 2–3 lake properties as short-term vacation rentals. Need someone who understands the investment angle and local STR regulations. Let's talk.",
        lead_type: 'buyer',
        lead_source: 'agent_inquiry',
        lead_status: 'in_progress',
        agent_id: AGENTS.marcus,
        budget_min: 400000,
        budget_max: 600000,
        timeline_text: 'Actively looking now',
        location_text: 'Multiple lakes, investor purchase',
        contact_preference: 'phone',
        source_page_url: '/pages/public/agent-profile.html',
        source_page_title: 'Agent Profile — Marcus Washington',
        days_ago: 11,
    },
];

// ─── Insert ──────────────────────────────────────────────────────────────────
async function seedLeads() {
    const client = await pool.connect();
    try {
        let inserted = 0;
        for (const lead of leads) {
            const createdAt = new Date();
            createdAt.setDate(createdAt.getDate() - lead.days_ago);

            await client.query(`
                INSERT INTO leads (
                    full_name, first_name, email, phone, message,
                    lead_type, lead_source, lead_status,
                    agent_id, budget_min, budget_max,
                    timeline_text, location_text, contact_preference,
                    source_page_url, source_page_title, created_at, submitted_at
                ) VALUES (
                    $1,$2,$3,$4,$5,
                    $6::lead_request_type,$7,$8::lead_status_type,
                    $9,$10,$11,
                    $12,$13,$14,
                    $15,$16,$17,$17
                )
            `, [
                lead.full_name, lead.first_name, lead.email, lead.phone, lead.message,
                lead.lead_type, lead.lead_source, lead.lead_status,
                lead.agent_id, lead.budget_min, lead.budget_max,
                lead.timeline_text, lead.location_text, lead.contact_preference,
                lead.source_page_url, lead.source_page_title, createdAt,
            ]);
            inserted++;
            console.log(`  ✓ ${lead.lead_status.padEnd(12)} [${lead.lead_type.padEnd(17)}] ${lead.full_name}`);
        }
        console.log(`\nDone — ${inserted} leads seeded.`);
    } finally {
        client.release();
        await pool.end();
    }
}

seedLeads().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
