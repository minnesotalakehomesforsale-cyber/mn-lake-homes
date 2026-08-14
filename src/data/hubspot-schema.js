// hubspot-schema.js — SINGLE SOURCE OF TRUTH for the HubSpot CRM schema we
// provision (T020 / B1 / B4). The ensure* functions in services/hubspot.js
// create/patch these via the API; docs/hubspot-schema.md documents them for the
// UI. Change options HERE and re-run POST /api/admin/hubspot/ensure-schema.
//
// Enum `value` is what forms POST and what HubSpot stores (keep stable — it's
// the reporting key); `label` is what humans see and can be re-worded freely.

// ── Shared lake option set (target_lake + deal_target_lake) ──────────────────
// 12 Tier-1 lakes from the recruitment list + 3 top Tier-2, then Other + Statewide.
const LAKE_OPTIONS = [
    { label: 'Lake Minnetonka',    value: 'lake_minnetonka' },
    { label: 'Gull Lake',          value: 'gull_lake' },
    { label: 'Whitefish Chain',    value: 'whitefish_chain' },
    { label: 'Mille Lacs Lake',    value: 'mille_lacs_lake' },
    { label: 'Lake Vermilion',     value: 'lake_vermilion' },
    { label: 'Leech Lake',         value: 'leech_lake' },
    { label: 'Lake of the Woods',  value: 'lake_of_the_woods' },
    { label: 'Rainy Lake',         value: 'rainy_lake' },
    { label: 'Detroit Lake',       value: 'detroit_lake' },
    { label: 'Lake Sallie',        value: 'lake_sallie' },
    { label: 'Lake Melissa',       value: 'lake_melissa' },
    { label: 'Otter Tail Lake',    value: 'otter_tail_lake' },
    { label: 'Lake Bemidji',       value: 'lake_bemidji' },
    { label: 'Lake Pepin',         value: 'lake_pepin' },
    { label: 'Lake Carlos',        value: 'lake_carlos' },
    { label: 'Other',              value: 'other' },
    { label: 'Statewide / Unsure', value: 'statewide_unsure' },
];

const INTENT_OPTIONS = [
    { label: 'Buyer',    value: 'buyer' },
    { label: 'Seller',   value: 'seller' },
    { label: 'Renter',   value: 'renter' },
    { label: 'Not sure', value: 'not_sure' },
];

const PRICE_BAND_OPTIONS = [
    { label: 'Under $300k',    value: 'under_300k' },
    { label: '$300k – $500k',  value: '300k_500k' },
    { label: '$500k – $750k',  value: '500k_750k' },
    { label: '$750k – $1M',    value: '750k_1m' },
    { label: '$1M – $1.5M',    value: '1m_1_5m' },
    { label: '$1.5M+',         value: '1_5m_plus' },
    { label: 'Unsure',         value: 'unsure' },
];

const LEAD_SOURCE_DETAIL_OPTIONS = [
    { label: 'Organic',        value: 'organic' },
    { label: 'Lake page',      value: 'lake_page' },
    { label: 'Blog',           value: 'blog' },
    { label: 'Social',         value: 'social' },
    { label: 'Agent referral', value: 'agent_referral' },
    { label: 'Direct',         value: 'direct' },
    { label: 'Other',          value: 'other' },
];

// Attach ascending displayOrder so the dropdown order is deterministic.
const ordered = opts => opts.map((o, i) => ({ ...o, displayOrder: i }));

const CONTACT_PROPERTY_GROUP = { name: 'lead_qualification', label: 'Lead Qualification', displayOrder: 20 };

// HubSpot CRM v3 property definitions (contacts).
const CONTACT_PROPERTIES = [
    { name: 'target_lake',        label: 'Target Lake',        type: 'enumeration', fieldType: 'select', groupName: CONTACT_PROPERTY_GROUP.name, options: ordered(LAKE_OPTIONS) },
    { name: 'intent_type',        label: 'Intent Type',        type: 'enumeration', fieldType: 'select', groupName: CONTACT_PROPERTY_GROUP.name, options: ordered(INTENT_OPTIONS) },
    { name: 'price_band',         label: 'Price Band',         type: 'enumeration', fieldType: 'select', groupName: CONTACT_PROPERTY_GROUP.name, options: ordered(PRICE_BAND_OPTIONS) },
    { name: 'lead_source_detail', label: 'Lead Source Detail', type: 'enumeration', fieldType: 'select', groupName: CONTACT_PROPERTY_GROUP.name, options: ordered(LEAD_SOURCE_DETAIL_OPTIONS) },
];

// ── Deal pipeline: Agent Acquisition (B4 / T025) ─────────────────────────────
// 8 stages. Won–Paying + Lost/Nurture are closed stages.
const DEAL_PIPELINE = {
    label: 'Agent Acquisition',
    stages: [
        { label: 'Target',              metadata: { isClosed: 'false', probability: '0.05' } },
        { label: 'Contacted',           metadata: { isClosed: 'false', probability: '0.15' } },
        { label: 'Engaged',             metadata: { isClosed: 'false', probability: '0.30' } },
        { label: 'Spotlight Live',      metadata: { isClosed: 'false', probability: '0.45' } },
        { label: 'Free Profile Claimed',metadata: { isClosed: 'false', probability: '0.60' } },
        { label: 'Pitch/Demo',          metadata: { isClosed: 'false', probability: '0.80' } },
        { label: 'Won–Paying',          metadata: { isClosed: 'true',  probability: '1.0' } },
        { label: 'Lost/Nurture',        metadata: { isClosed: 'true',  probability: '0.0' } },
    ].map((s, i) => ({ ...s, displayOrder: i })),
};

const AGENT_TIER_OPTIONS = [
    { label: 'Standard', value: 'standard' },
    { label: 'Prime',    value: 'prime' },
    { label: 'Elite',    value: 'elite' },
];

const LOST_REASON_OPTIONS = [
    { label: 'Price / budget',        value: 'price' },
    { label: 'Went with competitor',  value: 'competitor' },
    { label: 'Unresponsive',          value: 'unresponsive' },
    { label: 'Not a fit',             value: 'not_a_fit' },
    { label: 'Bad timing',            value: 'timing' },
    { label: 'Other',                 value: 'other' },
];

// Deal properties (group: dealinformation is a built-in group).
const DEAL_PROPERTIES = [
    { name: 'deal_target_lake',  label: 'Target Lake (deal)', type: 'enumeration', fieldType: 'select', groupName: 'dealinformation', options: ordered(LAKE_OPTIONS) },
    { name: 'agent_tier_target', label: 'Agent Tier Target',  type: 'enumeration', fieldType: 'select', groupName: 'dealinformation', options: ordered(AGENT_TIER_OPTIONS) },
    { name: 'lost_reason',       label: 'Lost Reason',        type: 'enumeration', fieldType: 'select', groupName: 'dealinformation', options: ordered(LOST_REASON_OPTIONS) },
];

// ── Helpers used by forms / the lead controller ──────────────────────────────
const _norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Map a lake's display name (from our DB) → a target_lake enum value.
// Anything we don't have an exact option for maps to 'other' (never an error).
const _lakeNameToValue = (() => {
    const m = new Map();
    for (const o of LAKE_OPTIONS) if (o.value !== 'other' && o.value !== 'statewide_unsure') m.set(_norm(o.label), o.value);
    // A couple of common aliases.
    m.set(_norm('Whitefish Lake'), 'whitefish_chain');
    m.set(_norm('Ottertail Lake'), 'otter_tail_lake');
    return name => m.get(_norm(name)) || null;
})();

function targetLakeValueForName(name) {
    return _lakeNameToValue(name);   // null when no confident match; caller decides ('other' vs unset)
}

// Validate a posted enum value against its option set (returns the value or null).
function validEnumValue(propName, value) {
    const sets = {
        target_lake: LAKE_OPTIONS, intent_type: INTENT_OPTIONS,
        price_band: PRICE_BAND_OPTIONS, lead_source_detail: LEAD_SOURCE_DETAIL_OPTIONS,
        deal_target_lake: LAKE_OPTIONS, agent_tier_target: AGENT_TIER_OPTIONS, lost_reason: LOST_REASON_OPTIONS,
    };
    const set = sets[propName];
    if (!set) return null;
    const v = String(value || '').trim();
    return set.some(o => o.value === v) ? v : null;
}

module.exports = {
    LAKE_OPTIONS, INTENT_OPTIONS, PRICE_BAND_OPTIONS, LEAD_SOURCE_DETAIL_OPTIONS,
    AGENT_TIER_OPTIONS, LOST_REASON_OPTIONS,
    CONTACT_PROPERTY_GROUP, CONTACT_PROPERTIES,
    DEAL_PIPELINE, DEAL_PROPERTIES,
    targetLakeValueForName, validEnumValue,
    // Names forms are allowed to set on a contact sync (the B1 four).
    QUALIFICATION_PROPS: ['target_lake', 'intent_type', 'price_band', 'lead_source_detail'],
};
