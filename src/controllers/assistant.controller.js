/**
 * assistant.controller.js — Admin AI chat backend
 *
 * Stores conversation history in ai_chat_messages so the assistant
 * has full memory across sessions. Calls OpenAI with a platform-aware
 * system prompt so it can intelligently help with admin tasks.
 */

const pool = require('../database/pool');

// Lazy-init the OpenAI client so a missing OPENAI_API_KEY doesn't crash boot
let _openai = null;
function getClient() {
    if (_openai) return _openai;
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const { OpenAI } = require('openai');
    _openai = new OpenAI({ apiKey: key });
    return _openai;
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_HISTORY = 40;  // last 40 messages sent as context (20 exchanges)

const SYSTEM_PROMPT = `You are the in-house AI assistant for the MN Lake Homes admin backend, a Minnesota lakefront real estate platform.

Your job is to help the platform operator with:
- Drafting agent profile copy (bios, service areas, specialties)
- Writing blog posts and marketing email copy
- Explaining how to accomplish tasks in the admin UI (Agents Directory, Central Leads, Inquiries, Blog & Content, Users Management, Marketing, Tasks, Stripe subscriptions)
- Troubleshooting errors the operator describes
- Drafting replies to leads and inquiries
- Summarizing long content, generating SEO descriptions, suggesting improvements
- Small coding help if asked (HTML/CSS/JS snippets)

Platform facts (use these in your responses when relevant):
- Site: minnesotalakehomesforsale.com, part of the CommonRealtor portfolio
- Built on Node.js/Express + PostgreSQL, deployed on Render
- Tabs in the admin backend: Dashboard, Agents Directory, Central Leads, Inquiries, Blog & Content, Users Management, Marketing, Tasks
- Featured lakes include Lake Minnetonka, Mille Lacs, Gull Lake, Leech Lake, Lake Vermilion, Prior Lake, White Bear Lake
- Agent tiers: Standard, Prime, Founder (billed monthly or annually via Stripe)
- Contact inquiries land in /pages/admin/inquiries.html and email minnesotalakehomesforsale@gmail.com (MN Lake Homes) or thecommonrealtor@gmail.com (CommonRealtor)

Be concise, concrete, and actionable. When drafting copy, default to MN Lake Homes voice: confident, local, specific (name real lakes, real towns). When explaining admin workflows, reference the actual tab / button names the user sees. Don't hedge or pad.`;

// ─── POST /api/assistant/chat ────────────────────────────────────────────────
exports.chat = async (req, res) => {
    const client = getClient();
    if (!client) {
        return res.status(503).json({ error: 'OpenAI is not configured. Set OPENAI_API_KEY.' });
    }

    const { message } = req.body || {};
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    try {
        // Save the user's message
        await pool.query(
            `INSERT INTO ai_chat_messages (role, content) VALUES ('user', $1)`,
            [message.trim()]
        );

        // Pull the last N messages for context
        const { rows: historyDesc } = await pool.query(
            `SELECT role, content FROM ai_chat_messages
             ORDER BY created_at DESC
             LIMIT $1`,
            [MAX_HISTORY]
        );
        const history = historyDesc.reverse();

        // Build the OpenAI messages array
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history.map(m => ({ role: m.role, content: m.content })),
        ];

        const completion = await client.chat.completions.create({
            model: MODEL,
            messages,
            temperature: 0.7,
            max_tokens: 1200,
        });

        const reply = completion.choices[0]?.message?.content?.trim() || 'Sorry, I had no response for that.';

        // Save the assistant's reply
        await pool.query(
            `INSERT INTO ai_chat_messages (role, content) VALUES ('assistant', $1)`,
            [reply]
        );

        res.json({ reply, model: MODEL });
    } catch (err) {
        console.error('[assistant.chat]', err.message);
        res.status(500).json({ error: `Assistant error: ${err.message}` });
    }
};

// ─── GET /api/assistant/history ──────────────────────────────────────────────
exports.getHistory = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, role, content, created_at
             FROM ai_chat_messages
             ORDER BY created_at ASC
             LIMIT 200`
        );
        res.json(rows);
    } catch (err) {
        console.error('[assistant.getHistory]', err.message);
        res.status(500).json({ error: 'Failed to fetch history.' });
    }
};

// ─── DELETE /api/assistant/history ───────────────────────────────────────────
exports.clearHistory = async (req, res) => {
    try {
        await pool.query(`DELETE FROM ai_chat_messages`);
        res.json({ success: true });
    } catch (err) {
        console.error('[assistant.clearHistory]', err.message);
        res.status(500).json({ error: 'Failed to clear history.' });
    }
};
