'use strict';

// Block E reply attribution. Each ladder send gets a per-send plus-addressed
// Reply-To that encodes (agentId, rung), HMAC-signed so it's stateless — no DB
// row per send, and forgery-proof. An inbound-email webhook parses the address,
// verifies the signature, and writes the response back to the agent record. That
// way the governor stays correct even while a human reads the monitored inbox:
// the write-back is automatic, the human just handles the actual photos/answers.
//
//   ladderReplyAddress(agentId, rung) → "replies+<payload>.<sig>@<domain>"
//   parseReplyToken(addressOrString)  → { agentId, rung } | null

const crypto = require('crypto');

const SECRET = process.env.UNSUB_SECRET || process.env.JWT_SECRET || 'dev-secret';
// The inbound domain must have MX pointed at the email provider's inbound parse,
// which forwards to POST /api/inbound-email. Config, like EM-02's EMAIL_FROM.
const INBOUND_DOMAIN = process.env.REPLY_INBOUND_DOMAIN || 'replies.minnesotalakehomesforsale.com';

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);

function ladderReplyAddress(agentId, rung) {
    const b = Buffer.from(`${agentId}.${rung}`).toString('base64url');
    return `replies+${b}.${sign(b)}@${INBOUND_DOMAIN}`;
}

function parseReplyToken(address) {
    const m = String(address || '').match(/\breplies\+([A-Za-z0-9_-]+)\.([a-f0-9]{16})@/i);
    if (!m) return null;
    const [, b, sig] = m;
    // timing-safe compare
    const expect = Buffer.from(sign(b));
    const got = Buffer.from(sig);
    if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return null;
    try {
        const [agentId, rung] = Buffer.from(b, 'base64url').toString('utf8').split('.');
        if (!agentId) return null;
        return { agentId, rung: parseInt(rung, 10) || 0 };
    } catch (_) { return null; }
}

module.exports = { ladderReplyAddress, parseReplyToken, INBOUND_DOMAIN };
