/**
 * phone.js — phone-number normalization for dedup + lookup.
 *
 * Real-world phones arrive in many shapes:
 *   (612) 555-1234
 *   612-555-1234
 *   612.555.1234
 *   +1 612 555 1234
 *   16125551234
 *   6125551234
 *
 * For dedup we need ALL of those to compare equal. We normalize to the
 * 10-digit US national number where possible, since 99% of users are
 * US-based and the leading `+1` / `1` country code is just framing.
 *
 * Non-US numbers fall through to the raw digit form (no country-code
 * stripping). Good enough for v1 — a future upgrade to libphonenumber
 * can replace this helper without touching the call sites.
 */

/**
 * Returns the normalized digit form for dedup comparisons, or null if
 * the input doesn't look like a usable phone number.
 *
 *   (612) 555-1234     → 6125551234
 *   612-555-1234       → 6125551234
 *   +1 612 555 1234    → 6125551234
 *   16125551234        → 6125551234
 *   6125551234         → 6125551234
 *   +44 20 7946 0958   → 442079460958  (non-US, no country-code strip)
 *   ""                 → null
 *   "abc"              → null
 *   "555-1234"         → null  (only 7 digits, not a real phone)
 */
function normalize(phone) {
    if (phone == null) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    // US/Canada 11-digit with leading 1: strip the country code.
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    // Plain 10-digit US/Canada.
    if (digits.length === 10) return digits;
    // 7 or fewer digits = local-only or invalid → don't pretend.
    if (digits.length < 8) return null;
    // International: store as-is (digit form). A future libphonenumber
    // upgrade can convert to true E.164 here.
    return digits;
}

/**
 * Returns true when the input parses to a normalized form ≥10 digits
 * (US-style minimum). Used for "is this a real-looking phone?" checks
 * during registration.
 */
function isValid(phone) {
    const n = normalize(phone);
    return !!n && n.length >= 10;
}

module.exports = { normalize, isValid };
