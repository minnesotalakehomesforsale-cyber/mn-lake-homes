/**
 * lead-grading.js — mechanical lead grading (Spec 1 / B1).
 *
 * Runs ONCE, server-side, after validation and before persistence. The grade is
 * stamped and never recomputed. The rule is deliberately mechanical — no intent
 * signals (arrived-from-a-lake-page, long message, returning visitor) touch the
 * grade — so it's defensible when an agent disputes a lead.
 *
 * Grades: A (hot) · B (qualified) · C (explicitly early — routed but never
 * counted toward what an agent was promised) · Unqualified (excluded from every
 * count). Agents are only ever promised A and B.
 */

// unqualified_reason values, in EVALUATION ORDER (first match wins).
const REASON_ORDER = [
    'spam_or_bot',
    'test_submission',
    'duplicate_30d',
    'industry_contact',
    'out_of_area',
    'missing_contact',
    'missing_name',
    'missing_lake',
    'missing_intent',
    'unreachable_contact',
    'opted_out',
];

// Obvious-junk name detector: keyboard runs, single repeated char, no vowels &
// short, or too short. Kept conservative so we don't reject real short names.
function isJunkName(name) {
    const n = String(name || '').trim().toLowerCase();
    if (n.length < 2) return true;
    if (/^(.)\1+$/.test(n.replace(/\s/g, ''))) return true;            // "aaaa"
    if (/asdf|qwer|zxcv|jkl;|test123|^test$|^asdf/.test(n)) return true;
    const letters = n.replace(/[^a-z]/g, '');
    if (letters.length >= 3 && !/[aeiouy]/.test(letters)) return true; // no vowels
    return false;
}

// Map a free-text timeframe (the form's `timeline` select) into one of:
//   'early' → explicitly distant/just-looking  (→ grade C)
//   'soon'  → within ~3 months                 (hot candidate)
//   'mid'   → 3–6 months / seasonal / ongoing
//   null    → not stated  (→ grade B, never C — absence isn't evidence)
function timeframeBucket(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (!t) return null;
    if (/explor|just looking|12\+|someday|not sure yet|no rush/.test(t)) return 'early';
    if (/asap|as soon|immediat|weekend|this month|within 1[–-]?3|within 3 month|7[–-]?14|2[–-]?4 week|1[–-]?2 month|ready to move/.test(t)) return 'soon';
    return 'mid';
}

/**
 * gradeLead(signals) — the pure rule. The caller computes the booleans (from the
 * DB for duplicate, from validation for the fields, etc.) and passes them in.
 *
 * @param {object} s
 * @param {boolean} s.spamFlagged        turnstile/honeypot/validation (usually pre-blocked)
 * @param {boolean} s.testFlagged        flagged at source (never inferred)
 * @param {boolean} s.isDuplicate        same email/phone in 30d, unchanged intent+lake
 * @param {boolean} s.industryContact    agent/broker/vendor/recruiter on a consumer form
 * @param {boolean} s.outOfArea          no Minnesota lake interest
 * @param {boolean} s.hasName            present and not junk
 * @param {boolean} s.hasContact         valid email OR 10-digit phone
 * @param {boolean} s.hasLake            target_lake set (incl statewide/unsure) OR mapped town
 * @param {boolean} s.hasIntent          intent in (buyer,seller,renter,not_sure)
 * @param {'early'|'soon'|'mid'|null} s.timeframe
 * @param {boolean} s.priceBandSet       price_band present
 * @returns {{ grade: 'A'|'B'|'C'|'Unqualified', reason: string|null }}
 */
function gradeLead(s = {}) {
    // 1. Exclusions first — first match wins, in REASON_ORDER.
    const exclusions = {
        spam_or_bot: !!s.spamFlagged,
        test_submission: !!s.testFlagged,
        duplicate_30d: !!s.isDuplicate,
        industry_contact: !!s.industryContact,
        out_of_area: !!s.outOfArea,
        missing_contact: !s.hasContact,
        missing_name: !s.hasName,
        missing_lake: !s.hasLake,
        missing_intent: !s.hasIntent,
        unreachable_contact: !!s.unreachable,
        opted_out: !!s.optedOut,
    };
    for (const reason of REASON_ORDER) {
        if (exclusions[reason]) return { grade: 'Unqualified', reason };
    }

    // 2. Explicitly-early beats everything below.
    if (s.timeframe === 'early') return { grade: 'C', reason: null };

    // 3. Hot: within ~3 months AND a price band on file.
    if (s.timeframe === 'soon' && s.priceBandSet) return { grade: 'A', reason: null };

    // 4. Everything else that cleared the bar.
    return { grade: 'B', reason: null };
}

module.exports = { gradeLead, timeframeBucket, isJunkName, REASON_ORDER };
