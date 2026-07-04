// ─── Lead quality scoring ───────────────────────────────────────────────────
// A fast, transparent heuristic that tags every lead hot / warm / cold so agents
// (and the founder) work the best leads first. No ML, no black box — just the
// signals that actually predict a closeable deal in lake real estate. Runs at
// lead creation; the score/tier are stored on the lead and shown in the inbox.
//
// Waterfront + a real phone + a seller/cash-offer intent is the golden lead:
// high-value property, reachable, and commission on both sides for the founder.

// Accepts loose input (from the create flow OR a DB row) and normalizes it.
function scoreLead(input = {}) {
    const type    = String(input.enumType || input.lead_type || input.type || '').toLowerCase();
    const phone   = input.phone || '';
    const email   = input.email || '';
    const notes   = String(input.notes || input.message || '').toLowerCase();
    const address = input.address || input.property_address || '';
    const isWaterfront = input.isWaterfront ?? input.is_waterfront ?? null;
    const wfFeet  = input.wfFeetNum ?? input.waterfront_feet ?? null;

    let score = 0;
    const reasons = [];
    const add = (pts, why) => { score += pts; reasons.push(why); };

    // Reachability — a phone number is the single biggest predictor of contact.
    if (String(phone).replace(/[^0-9]/g, '').length >= 10) add(25, 'Phone provided');
    if (email) add(8, 'Email provided');

    // Intent — sellers and cash-offer requests are the highest-value leads
    // (listing commission + they're the founder-lead engine).
    if (type === 'seller' || type === 'cash_offer' || type.includes('sell')) add(25, 'Seller / cash-offer intent');
    else if (type === 'buyer') add(12, 'Buyer intent');
    else if (type === 'property_question') add(10, 'Asked about a specific property');

    // Waterfront — the premium segment; shoreline detail signals seriousness.
    if (isWaterfront === true) add(20, 'Waterfront property');
    if (Number(wfFeet) > 0) add(8, 'Gave shoreline footage');

    // Specificity — a real address means a real, workable property.
    if (address && String(address).trim().length > 6) add(15, 'Specific property address');

    // Urgency & budget cues in the free text.
    if (/\b(asap|immediately|urgent|this (week|month)|ready to (buy|sell|move)|need to sell)\b/.test(notes)) add(15, 'Urgent timeline');
    if (/\b(pre-?approved|cash|financing secured|budget|\$\s?\d)/.test(notes)) add(10, 'Budget / financing signal');
    if (notes.length > 120) add(5, 'Detailed message');

    score = Math.max(0, Math.min(100, score));
    const tier = score >= 55 ? 'hot' : score >= 30 ? 'warm' : 'cold';
    return { score, tier, reasons };
}

module.exports = { scoreLead };
