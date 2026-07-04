// ─── SMS alerts (Twilio) ────────────────────────────────────────────────────
// Speed-to-lead is everything in real estate — the agent who calls first wins.
// Email alone is too slow, so we text the assigned agent the instant a lead is
// routed to them. Fully env-gated: a no-op until Twilio credentials are set, so
// it's safe to ship dark and flip on later.
//
// Config (Render env):
//   TWILIO_ACCOUNT_SID  — your Twilio account SID (starts "AC…")
//   TWILIO_AUTH_TOKEN   — your Twilio auth token
//   TWILIO_FROM         — a Twilio phone number (E.164, e.g. +16125551234)
//                         OR set TWILIO_MESSAGING_SERVICE_SID instead
// Uses Twilio's REST API directly via fetch — no SDK dependency to install.

const pool = require('../database/pool');

const SID   = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM  = process.env.TWILIO_FROM;
const MSGSID = process.env.TWILIO_MESSAGING_SERVICE_SID;

function isConfigured() {
    return !!(SID && TOKEN && (FROM || MSGSID));
}

// Normalize a US phone to E.164 (+1XXXXXXXXXX). Returns null if it can't.
function toE164(raw) {
    if (!raw) return null;
    let d = String(raw).trim();
    if (d.startsWith('+')) return /^\+\d{8,15}$/.test(d) ? d : null;
    d = d.replace(/[^0-9]/g, '');
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d.startsWith('1')) return '+' + d;
    return null;
}

// Low-level send. Resolves { sid } on success or throws. Silent no-op (returns
// null) when Twilio isn't configured or the number is unusable.
async function sendSms(to, body) {
    if (!isConfigured()) return null;
    const dest = toE164(to);
    if (!dest) return null;

    const params = new URLSearchParams();
    params.set('To', dest);
    if (MSGSID) params.set('MessagingServiceSid', MSGSID); else params.set('From', FROM);
    params.set('Body', body.slice(0, 1500));

    const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;
    const auth = Buffer.from(`${SID}:${TOKEN}`).toString('base64');
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Twilio ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
}

const SITE = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');

// Look up the assigned agent's best mobile number. Prefers the public profile
// phone, falls back to the account phone. Returns null when neither is usable
// or the agent has opted out of SMS.
async function agentPhone({ userId, agentId }) {
    try {
        const { rows } = await pool.query(
            `SELECT a.phone_public, u.phone, COALESCE(a.sms_alerts, TRUE) AS sms_alerts
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE ($1::uuid IS NOT NULL AND a.id = $1) OR ($2::uuid IS NOT NULL AND a.user_id = $2)
              LIMIT 1`,
            [agentId || null, userId || null]);
        const r = rows[0];
        if (!r || r.sms_alerts === false) return null;
        return toE164(r.phone_public) || toE164(r.phone);
    } catch (_) { return null; }
}

// Text the assigned agent about a fresh lead. Best-effort, never throws — a
// flaky SMS must never break lead creation. Returns true if a text went out.
async function notifyAgentNewLead({ userId, agentId, lead }) {
    if (!isConfigured()) return false;
    try {
        const to = await agentPhone({ userId, agentId });
        if (!to) return false;
        const who  = lead.name || 'A buyer';
        const kind = (lead.type || 'lead').replace(/_/g, ' ');
        const area = lead.address ? ` for ${lead.address}` : (lead.area ? ` — ${lead.area}` : '');
        const hot  = lead.hot ? '🔥 HOT ' : '';
        const body = `${hot}New ${kind} lead: ${who}${area}. `
            + (lead.phone ? `Call ${lead.phone}. ` : (lead.email ? `Email ${lead.email}. ` : ''))
            + `Details: ${SITE}/pages/agent/dashboard.html`;
        await sendSms(to, body);
        return true;
    } catch (e) {
        console.warn('[sms] agent notify failed:', e.message);
        return false;
    }
}

module.exports = { isConfigured, sendSms, notifyAgentNewLead, toE164 };
