// Fixed set of agent FAQ questions. Agents write their own answers in the
// dashboard; only answered questions render on the public profile (and feed
// the FAQPage JSON-LD). An agent with zero answers shows no FAQ section.
//
// Keys are STABLE — never rename one, or existing answers orphan.
const AGENT_FAQS = [
    { key: 'why_me',          q: 'Why work with me?' },
    { key: 'local_knowledge', q: 'Which areas and lakes do you know best?' },
    { key: 'buyers',          q: 'How do you help buyers find the right lake home?' },
    { key: 'sellers',         q: "What's your approach to selling lakefront property?" },
    { key: 'experience',      q: 'What experience do you have with waterfront real estate?' },
];

const AGENT_FAQ_KEYS = AGENT_FAQS.map(f => f.key);

// Normalize whatever the client sent into { key: answer } with only known
// keys and non-empty, length-capped answers.
function cleanAgentFaq(input) {
    const out = {};
    if (input && typeof input === 'object') {
        for (const { key } of AGENT_FAQS) {
            const v = String(input[key] || '').trim().slice(0, 1500);
            if (v) out[key] = v;
        }
    }
    return out;
}

// Merge stored answers with the question text, in fixed order, keeping only
// answered ones. Returns [{ key, q, a }].
function answeredFaqList(stored) {
    const faq = (stored && typeof stored === 'object') ? stored : {};
    return AGENT_FAQS
        .map(({ key, q }) => ({ key, q, a: String(faq[key] || '').trim() }))
        .filter(item => item.a);
}

module.exports = { AGENT_FAQS, AGENT_FAQ_KEYS, cleanAgentFaq, answeredFaqList };
