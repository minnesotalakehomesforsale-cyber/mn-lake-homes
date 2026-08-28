'use strict';

// One sample per LIVE template, shared by the file-renderer (render-emails.js)
// and the live-pass harness (live-pass.js). Each entry sends its template with
// representative data to `to`. `owner: true` marks the internal reports/alerts
// that address the owner via OWNER_EMAIL — the harness points that env at the
// seed instead of injecting a recipient.
//
// The 4 EM-07-retired admin-notification templates are intentionally EXCLUDED —
// they no longer send in production, so a live pass on them would test dead code.

const RT = 'replies+EXAMPLE.0000000000000000@replies.minnesotalakehomesforsale.com';
const A = 'https://minnesotalakehomesforsale.com/a/EXAMPLETOKEN';
const lead = { id: 'L1', name: 'Sam Buyer', first_name: 'Sam', email: 'buyer@example.com', phone: '218-555-0100', type: 'buyer', target_lake: 'Gull Lake', intent_type: 'buying', address: 'Nisswa, MN', notes: 'Looking for waterfront.', timeline_text: 'this summer' };

const weeklyReport = {
    numbers: {
        current: { sessions: 412, lake_views: 214, leads_submitted: 3, leads_routed: 2, leads_unrouted: 1, completion_rate: null, median_ttc_min: 34, new_agents: 1, profiles_published: 1, new_businesses: 0, paid_conversions: 1, cancellations: 0 },
        previous: { sessions: 380, lake_views: 190, leads_submitted: 2, leads_routed: 2, leads_unrouted: 0, completion_rate: null, median_ttc_min: 51, new_agents: 0, profiles_published: 0, new_businesses: 1, paid_conversions: 0, cancellations: 0 },
        avg: { sessions: 395, lake_views: 200, leads_submitted: 2, leads_routed: 2, leads_unrouted: 1, completion_rate: null, median_ttc_min: 42, new_agents: 1, profiles_published: 1, new_businesses: 0, paid_conversions: 1, cancellations: 0 },
    },
    mrr: 87, topLakes: [{ lake: 'Gull Lake', views: 96 }, { lake: 'North Long Lake', views: 44 }],
    leads: [{ lake: 'Gull Lake', agent: 'Dana Smith', accepted_at: '2026-08-25', routed_at: '2026-08-25T10:00:00Z', first_contact_at: '2026-08-25T10:34:00Z' }, { lake: 'Round Lake', agent: null, accepted_at: null, routed_at: null, first_contact_at: null }],
    content: { pages_published: 1, blog_live: 51, agent_replies: 2 },
    whatRan: { open_incidents: 0, bounce_rate: 0, emailsByTemplate: [{ template_key: 'lead_agent_matched', sent: 2 }], sweeps: [{ name: 'lead-sla', last_run_at: '2026-08-24' }] },
};
const periodicSections = { numbersTable: '<p>—</p>', sparkNote: 'trend = weekly buckets', topByTraffic: [{ lake: 'Gull Lake', views: 812 }], topByLeads: [{ lake: 'Gull Lake', leads: 9 }], tierLine: 'Free 4 · Standard 2 · Prime 1 · Elite 1 — MRR $250.', cohort: { joined: 5, active: 6, churned: 1 }, contentLine: '51 blog posts · 120 lake pages · 38 thin' };
const periodicActions = { recruit: [{ text: 'Recruit an agent on Bald Eagle Lake' }], fix: [{ text: '2 unrouted leads' }] };

const SAMPLES = [
    // Consumer
    { name: 'EM-welcome_consumer', key: 'welcome', send: (e, to) => e.sendWelcome({ email: to, display_name: 'Sam', first_name: 'Sam' }) },
    { name: 'password_reset', key: 'password_reset', send: (e, to) => e.sendPasswordReset({ to, first_name: 'Sam', resetUrl: A }) },
    { name: 'admin_password_reset', key: 'admin_password_reset', send: (e, to) => e.sendAdminPasswordReset({ email: to, first_name: 'Sam' }, 'TempPass123') },
    { name: 'lead_confirmation', key: 'lead_confirmation', send: (e, to) => e.sendLeadConfirmation({ ...lead, email: to }) },
    { name: 'inquiry_confirmation', key: 'inquiry_confirmation', send: (e, to) => e.sendInquiryConfirmation({ to, name: 'Sam', source: 'mnlakehomes' }) },
    { name: 'inquiry_notification', key: 'inquiry_notification', send: (e, to) => e.sendInquiryNotification({ to, source: 'commonrealtor', name: 'Sam', email: 'buyer@example.com', phone: '218-555-0100', inquirer_type: 'buyer', message: 'Do you cover Gull Lake?', inquiryId: 'I1', createdAt: new Date().toISOString() }) },
    { name: 'EM-24_lead_agent_matched', key: 'lead_agent_matched', send: (e, to) => e.sendLeadAgentMatched({ to, lead_first_name: 'Sam', agent_full_name: 'Dana Smith', agent_first_name: 'Dana', brokerage: 'Northland Realty', lake_name: 'Gull Lake', town: 'Nisswa', agent_bio: 'Dana helps families find lake homes across the Brainerd Lakes area.', years_experience: 12, nearby_lakes: 'North Long Lake, Round Lake', agent_phone: '218-555-0100', agent_email: 'dana@northland.com', photo_url: null, specialty: 'specializes in waterfront and cabins' }) },
    { name: 'EM-13_no_agent_yet', key: 'lead_no_agent_yet', send: (e, to) => e.sendNoAgentYet({ to, first_name: 'Sam', lake_name: 'Gull Lake', lake_slug: 'gull-lake', nearby_lakes: ['North Long Lake', 'Round Lake'] }) },
    { name: 'EM-14_reroute_buyer', key: 'lead_reroute_buyer', send: (e, to) => e.sendRerouteBuyer({ to, first_name: 'Sam', lake_name: 'Gull Lake' }) },
    { name: 'EM-16_did_they_reach_out', key: 'buyer_feedback_72h', send: (e, to) => e.sendDidTheyReachOut({ to, first_name: 'Sam', agent_full_name: 'Dana Smith', yesUrl: A + '1', notYetUrl: A + '2', pausedUrl: A + '3' }) },
    { name: 'lead_landed_win_back', key: 'lead_landed_win_back', send: (e, to) => e.sendLeadLandedWinBack({ to, name: 'Sam', lakeName: 'Gull Lake' }) },

    // Agent
    { name: 'EM-10_agent_welcome', key: 'agent_welcome', send: (e, to) => e.sendAgentWelcome({ email: to, display_name: 'Dana Smith', lake_name: 'Gull Lake', lake_count: 1 }) },
    { name: 'EM-11_agent_profile_live', key: 'agent_profile_live', send: (e, to) => e.sendAgentProfileLive({ email: to, display_name: 'Dana Smith', slug: 'dana-smith', tier: 'paid', lake_name: 'Gull Lake', lake_slug: 'gull-lake' }) },
    { name: 'matched_agent_notification', key: 'matched_agent_notification', send: (e, to) => e.sendMatchedAgentNotification({ to, agentFirstName: 'Dana', lead, distanceMiles: 4, matchedAreas: ['Gull Lake'] }) },
    { name: 'agent_lead_assigned', key: 'agent_lead_assigned', send: (e, to) => e.sendAgentLeadAssigned({ to, agentFirstName: 'Dana', lead, assignedBy: 'the MN Lake Homes team' }) },
    { name: 'manual_lead_offer', key: 'manual_lead_offer', send: (e, to) => e.sendManualLeadOffer({ to, agentFirstName: 'Dana', lead, acceptUrl: A, expiresHours: 24 }) },
    { name: 'EM-15_agent_nudge_1h', key: 'agent_response_nudge', send: (e, to) => e.sendAgentNudge({ variant: '1h', to, agentFirstName: 'Dana', buyer_first: 'Sam', lake_name: 'Gull Lake', timeline: 'this summer', budget: '$300k–$450k', intent: 'buying', phone: '218-555-0100', markContactedUrl: A }) },
    { name: 'EM-14_reroute_agent', key: 'lead_reroute_agent', send: (e, to) => e.sendRerouteAgent({ to, agentFirstName: 'Dana', buyer_first: 'Sam', lake_name: 'Gull Lake', timeline: 'this summer', windowHours: 24 }) },
    { name: 'agent_profile_nudge', key: 'agent_profile_nudge', send: (e, to) => e.sendAgentProfileNudge({ to, first_name: 'Dana', missing: ['Bio', 'Photo'], nudgeNumber: 1 }) },
    { name: 'agent_profile_enrichment_nudge', key: 'agent_profile_enrichment_nudge', send: (e, to) => e.sendAgentProfileEnrichmentNudge({ to, first_name: 'Dana', missing: ['Specialties'], nudgeNumber: 1 }) },
    { name: 'referral_reward', key: 'referral_reward', send: (e, to) => e.sendReferralRewardEmail({ to, first_name: 'Dana', kind: 'referrer', auto: false }) },
    { name: 'agent_exit_survey', key: 'agent_exit_survey', send: (e, to) => e.sendAgentExitSurvey({ to, first_name: 'Dana' }) },
    { name: 'agent_message_notification', key: 'agent_message_notification', send: (e, to) => e.sendAgentMessageNotification({ to, agentFirstName: 'Dana', body: 'Quick question about your Gull Lake listing.', senderName: 'the MN Lake Homes team' }) },
    { name: 'agent_payment_failed', key: 'agent_payment_failed', send: (e, to) => e.sendAgentPaymentFailed({ to, name: 'Dana', attempt: 1, final: false }) },
    { name: 'agent_invite', key: 'agent_invite', send: (e, to) => e.sendAgentInvite({ to, first_name: 'Dana', tier_label: 'Prime', tempPassword: 'TempPass123', comped: false }) },
    { name: 'EM-18_ladder_photos', key: 'ladder_photos', send: (e, to) => e.sendLadderPhotos({ to, first_name: 'Dana', lake_name: 'Gull Lake', replyTo: RT }) },
    { name: 'EM-19_ladder_question', key: 'ladder_question', send: (e, to) => e.sendLadderQuestion({ to, first_name: 'Dana', lake_name: 'Gull Lake', replyTo: RT }) },
    { name: 'EM-20_ladder_featured', key: 'ladder_featured', send: (e, to) => e.sendLadderFeatured({ to, first_name: 'Dana', lake_name: 'Gull Lake', contributed: 'photos', lake_url: 'https://minnesotalakehomesforsale.com/lakes/gull-lake', replyTo: RT }) },

    // Business
    { name: 'business_welcome', key: 'business_welcome', send: (e, to) => e.sendBusinessWelcome({ to, name: 'Pat', businessName: 'Nisswa Dock Co.', businessType: 'Marine' }) },
    { name: 'business_payment_received', key: 'business_payment_received', send: (e, to) => e.sendBusinessPaymentReceived({ to, name: 'Pat', businessName: 'Nisswa Dock Co.' }) },
    { name: 'business_approved', key: 'business_approved', send: (e, to) => e.sendBusinessApproved({ to, name: 'Pat', businessName: 'Nisswa Dock Co.', slug: 'nisswa-dock-co' }) },
    { name: 'business_payment_failed', key: 'business_payment_failed', send: (e, to) => e.sendBusinessPaymentFailed({ to, name: 'Pat', businessName: 'Nisswa Dock Co.' }) },
    { name: 'business_subscription_cancelled', key: 'business_subscription_cancelled', send: (e, to) => e.sendBusinessSubscriptionCancelled({ to, name: 'Pat', businessName: 'Nisswa Dock Co.' }) },
    { name: 'business_invite', key: 'business_invite', send: (e, to) => e.sendBusinessInvite({ to, first_name: 'Pat', business_name: 'Nisswa Dock Co.', tier_label: 'Premium', tempPassword: 'TempPass123' }) },
    { name: 'cash_offer_to_partner', key: 'cash_offer_to_partner', send: (e, to) => e.sendCashOfferToPartner({ to, partnerName: 'Pat', customMessage: 'A seller on Gull Lake wants a cash offer.', offer: { address: '123 Lakeshore Dr', lake: 'Gull Lake' }, fromName: 'Hunter', fromEmail: 'hunter@example.com' }) },

    // Owner (internal) — the harness points OWNER_EMAIL at the seed.
    { name: 'incident_p1_alert', key: 'incident_p1_alert', owner: true, send: (e) => e.sendIncidentAlert({ title: 'Lead form is returning 5xx', effect: 'Leads are being lost right now.', checkFirst: 'The POST /api/leads route and the database.', adminLink: '/pages/admin/leads.html', occurrences: 3, repeated: false }) },
    { name: 'incident_p2_digest', key: 'incident_p2_digest', owner: true, send: (e) => e.sendIncidentDigest({ incidents: [{ title: 'Unrouted lead on Gull Lake', occurrences: 2, detail: 'Sam (buyer@example.com)' }, { title: 'Sitemap generation failed', occurrences: 1, detail: null }] }) },
    { name: 'EM-08_weekly_report', key: 'weekly_report', owner: true, send: (e) => e.sendWeeklyReport({ subject: 'MN Lake Homes — week of Aug 24', statusLine: 'All systems normal — 3 emails sent, no incidents.', report: weeklyReport, actions: [{ text: 'You had 1 lead on a lake with no agent — Round Lake', link: '/pages/admin/leads.html' }] }) },
    { name: 'EM-09_periodic_report', key: 'periodic_report', owner: true, send: (e) => e.sendPeriodicReport({ kind: 'six_month', subject: 'MN Lake Homes — Six-month review', statusLine: 'Six-month review: 51 leads, 8 new agents, MRR $250.', report: { numbers: { current: {}, previous: {}, avg: {} }, mrr: 250, whatRan: { open_incidents: 0 } }, sections: { ...periodicSections, stopDoing: ['Bald Eagle Lake: a built-out page with an agent that produced no leads in six months.'], retentionLine: '4 paying now · 1 churned all-time.' }, actions: periodicActions }) },
];

// EM-07-retired admin notifications — excluded on purpose (no longer sent).
const EXCLUDED = ['agent_admin_notification', 'admin_lead_notification', 'business_admin_notification', 'admin_subscription_cancelled'];

module.exports = { SAMPLES, EXCLUDED };
