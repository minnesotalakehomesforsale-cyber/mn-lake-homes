/**
 * contacts.controller.js — the agent portal's "light CRM" (portal #12/#13/#16).
 *
 * Deliberately shallow by design: a contact, a pipeline stage, a next-step
 * reminder, and notes. NOT a full CRM — no dialer, no email sequencing. The
 * point is to give an agent a reason to open the portal even when we're sending
 * zero leads, and to make our platform leads land inside a workflow they're
 * already using (one list, not two).
 *
 * Routes (mounted under /api/agents/me/contacts):
 *   GET    /                 list + stage counts (mirrors platform leads first)
 *   POST   /                 create a contact
 *   PATCH  /:id              update fields / move stage
 *   DELETE /:id              archive (soft)
 *   GET    /:id/notes        list notes
 *   POST   /:id/notes        add a note
 *   POST   /import           bulk CSV import
 */
const pool = require('../database/pool');

const STAGES = ['new', 'contacted', 'showing', 'offer', 'closed', 'lost'];
const TYPES  = ['buyer', 'seller', 'renter', 'other'];

// Resolve the signed-in user's agent id (all routes are agent-scoped).
async function agentIdFor(userId) {
    const r = await pool.query(`SELECT id FROM agents WHERE user_id = $1 LIMIT 1`, [userId]);
    return r.rows[0]?.id || null;
}

// #16 — mirror the agent's routed platform leads into their contact list so it's
// one list. Idempotent (unique on agent_id+lead_id); skips leads already
// archived here so a deleted platform contact never reappears. Only pulls
// still-open leads so we don't resurrect old closed ones as "new".
async function ensurePlatformLeadContacts(agentId) {
    try {
        await pool.query(
            `INSERT INTO agent_contacts (agent_id, name, email, phone, contact_type, stage, source, lead_id, area)
             SELECT $1,
                    COALESCE(NULLIF(btrim(l.full_name), ''), 'Lead'),
                    l.email, l.phone,
                    CASE l.lead_type WHEN 'seller' THEN 'seller' WHEN 'renter' THEN 'renter' ELSE 'buyer' END,
                    'new', 'platform_lead', l.id, l.location_text
               FROM leads l
              WHERE l.agent_id = $1
                AND l.deleted_at IS NULL
                AND COALESCE(l.lead_status, 'new') NOT IN ('closed', 'archived', 'spam')
             ON CONFLICT (agent_id, lead_id) WHERE lead_id IS NOT NULL DO NOTHING`,
            [agentId]
        );
    } catch (e) {
        console.warn('[contacts.mirror]', e.message);
    }
}

// GET /api/agents/me/contacts
exports.list = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        await ensurePlatformLeadContacts(agentId);

        const { rows } = await pool.query(
            `SELECT c.id, c.name, c.email, c.phone, c.contact_type, c.stage, c.source,
                    c.lead_id, c.area, c.next_step_at, c.next_step_note,
                    c.created_at, c.updated_at,
                    (SELECT COUNT(*)::int FROM agent_contact_notes n WHERE n.contact_id = c.id) AS note_count
               FROM agent_contacts c
              WHERE c.agent_id = $1 AND c.archived_at IS NULL
              ORDER BY (c.next_step_at IS NULL), c.next_step_at ASC, c.updated_at DESC`,
            [agentId]
        );

        // Stage counts + how many next-steps are due/overdue (for the header).
        const counts = STAGES.reduce((m, s) => (m[s] = 0, m), {});
        let dueToday = 0, overdue = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (const c of rows) {
            if (counts[c.stage] != null) counts[c.stage]++;
            if (c.next_step_at) {
                const d = new Date(c.next_step_at); d.setHours(0, 0, 0, 0);
                if (d < today) overdue++; else if (d.getTime() === today.getTime()) dueToday++;
            }
        }
        res.json({ contacts: rows, counts, total: rows.length, next_steps: { due_today: dueToday, overdue } });
    } catch (e) {
        console.error('[contacts.list]', e.message);
        res.status(500).json({ error: 'Failed to load contacts.' });
    }
};

const clean = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);

// POST /api/agents/me/contacts
exports.create = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        const name = clean(req.body?.name);
        if (!name) return res.status(400).json({ error: 'A name is required.' });
        const contact_type = TYPES.includes(req.body?.contact_type) ? req.body.contact_type : 'buyer';
        const stage = STAGES.includes(req.body?.stage) ? req.body.stage : 'new';
        const { rows } = await pool.query(
            `INSERT INTO agent_contacts (agent_id, name, email, phone, contact_type, stage, source, area, next_step_at, next_step_note)
             VALUES ($1,$2,$3,$4,$5,$6,'manual',$7,$8,$9) RETURNING *`,
            [agentId, name, clean(req.body?.email), clean(req.body?.phone), contact_type, stage,
             clean(req.body?.area), req.body?.next_step_at || null, clean(req.body?.next_step_note, 500)]
        );
        res.status(201).json(rows[0]);
    } catch (e) {
        console.error('[contacts.create]', e.message);
        res.status(500).json({ error: 'Failed to create contact.' });
    }
};

// PATCH /api/agents/me/contacts/:id
exports.update = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        const sets = [], vals = [];
        const push = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if ('name' in req.body)           { const n = clean(req.body.name); if (!n) return res.status(400).json({ error: 'Name cannot be blank.' }); push('name', n); }
        if ('email' in req.body)          push('email', clean(req.body.email));
        if ('phone' in req.body)          push('phone', clean(req.body.phone));
        if ('area' in req.body)           push('area', clean(req.body.area));
        if ('contact_type' in req.body && TYPES.includes(req.body.contact_type))  push('contact_type', req.body.contact_type);
        if ('stage' in req.body && STAGES.includes(req.body.stage))               push('stage', req.body.stage);
        if ('next_step_at' in req.body)   push('next_step_at', req.body.next_step_at || null);
        if ('next_step_note' in req.body) push('next_step_note', clean(req.body.next_step_note, 500));
        if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
        vals.push(agentId, req.params.id);
        const { rows } = await pool.query(
            `UPDATE agent_contacts SET ${sets.join(', ')}, updated_at = NOW()
              WHERE agent_id = $${vals.length - 1} AND id = $${vals.length} AND archived_at IS NULL
              RETURNING *`,
            vals
        );
        if (!rows.length) return res.status(404).json({ error: 'Contact not found.' });
        res.json(rows[0]);
    } catch (e) {
        console.error('[contacts.update]', e.message);
        res.status(500).json({ error: 'Failed to update contact.' });
    }
};

// DELETE /api/agents/me/contacts/:id — soft archive (so a mirrored platform
// lead can't silently reappear on the next list load).
exports.remove = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        const { rowCount } = await pool.query(
            `UPDATE agent_contacts SET archived_at = NOW(), updated_at = NOW()
              WHERE agent_id = $1 AND id = $2 AND archived_at IS NULL`,
            [agentId, req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Contact not found.' });
        res.json({ success: true });
    } catch (e) {
        console.error('[contacts.remove]', e.message);
        res.status(500).json({ error: 'Failed to remove contact.' });
    }
};

// GET /api/agents/me/contacts/:id/notes
exports.listNotes = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        // Ownership check folded into the join.
        const { rows } = await pool.query(
            `SELECT n.id, n.body, n.created_at
               FROM agent_contact_notes n
               JOIN agent_contacts c ON c.id = n.contact_id
              WHERE n.contact_id = $1 AND c.agent_id = $2
              ORDER BY n.created_at DESC`,
            [req.params.id, agentId]
        );
        res.json(rows);
    } catch (e) {
        console.error('[contacts.listNotes]', e.message);
        res.status(500).json({ error: 'Failed to load notes.' });
    }
};

// POST /api/agents/me/contacts/:id/notes
exports.addNote = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        const body = clean(req.body?.body, 4000);
        if (!body) return res.status(400).json({ error: 'Note cannot be empty.' });
        // Verify ownership before inserting.
        const own = await pool.query(`SELECT 1 FROM agent_contacts WHERE id = $1 AND agent_id = $2`, [req.params.id, agentId]);
        if (!own.rowCount) return res.status(404).json({ error: 'Contact not found.' });
        const { rows } = await pool.query(
            `INSERT INTO agent_contact_notes (contact_id, agent_id, body) VALUES ($1,$2,$3) RETURNING id, body, created_at`,
            [req.params.id, agentId, body]
        );
        await pool.query(`UPDATE agent_contacts SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
        res.status(201).json(rows[0]);
    } catch (e) {
        console.error('[contacts.addNote]', e.message);
        res.status(500).json({ error: 'Failed to add note.' });
    }
};

// Minimal RFC-4180-ish CSV parser (handles quoted fields + escaped quotes +
// commas/newlines inside quotes). Good enough for exports from Follow Up Boss,
// Google Contacts, a spreadsheet, etc.
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    const s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inQuotes) {
            if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
            else field += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
}

// POST /api/agents/me/contacts/import  { csv: "<raw csv text>" }
// First row is treated as a header. We map common column names to our fields.
exports.importCsv = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        const csv = String(req.body?.csv || '');
        if (!csv.trim()) return res.status(400).json({ error: 'No CSV provided.' });
        const rows = parseCsv(csv);
        if (rows.length < 2) return res.status(400).json({ error: 'CSV needs a header row and at least one contact.' });

        const header = rows[0].map(h => h.trim().toLowerCase());
        const idx = (...names) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
        const iName  = idx('name', 'full name', 'full_name', 'contact', 'contact name');
        const iFirst = idx('first name', 'first_name', 'first');
        const iLast  = idx('last name', 'last_name', 'last');
        const iEmail = idx('email', 'email address', 'e-mail');
        const iPhone = idx('phone', 'phone number', 'mobile', 'cell');
        const iType  = idx('type', 'contact type', 'contact_type');
        const iArea  = idx('area', 'city', 'location', 'market');
        if (iName < 0 && iFirst < 0 && iEmail < 0)
            return res.status(400).json({ error: 'Couldn\'t find a name or email column. Include a "Name" or "Email" header.' });

        let imported = 0, skipped = 0;
        const MAX = 1000;
        for (let r = 1; r < rows.length && imported < MAX; r++) {
            const cols = rows[r];
            const at = i => (i >= 0 && i < cols.length ? String(cols[i]).trim() : '');
            let name = at(iName);
            if (!name) name = [at(iFirst), at(iLast)].filter(Boolean).join(' ').trim();
            const email = at(iEmail);
            if (!name && !email) { skipped++; continue; }
            if (!name) name = email.split('@')[0];
            const type = TYPES.includes(at(iType).toLowerCase()) ? at(iType).toLowerCase() : 'buyer';
            try {
                await pool.query(
                    `INSERT INTO agent_contacts (agent_id, name, email, phone, contact_type, stage, source, area)
                     VALUES ($1,$2,$3,$4,$5,'new','import',$6)`,
                    [agentId, clean(name), clean(email), clean(at(iPhone)), type, clean(at(iArea))]
                );
                imported++;
            } catch (_) { skipped++; }
        }
        res.json({ imported, skipped, truncated: rows.length - 1 > MAX });
    } catch (e) {
        console.error('[contacts.importCsv]', e.message);
        res.status(500).json({ error: 'Failed to import CSV.' });
    }
};

/**
 * runContactReminderDigest() — portal #15. Groups today's + overdue next-steps
 * by agent and emails each a short digest. Safe to call from a daily job;
 * returns a summary. Best-effort per agent.
 */
exports.runContactReminderDigest = async function runContactReminderDigest() {
    let sent = 0;
    try {
        // Once-per-calendar-day guard so a restart can't re-blast the digest.
        const today = new Date().toISOString().slice(0, 10);
        const marker = await pool.query(`SELECT value FROM app_config WHERE key = 'contact_digest_last_date'`);
        if (marker.rows[0]?.value === today) return { skipped: true };

        const { rows } = await pool.query(
            `SELECT c.agent_id, u.email AS agent_email, a.display_name,
                    c.name, c.next_step_at, c.next_step_note, c.stage
               FROM agent_contacts c
               JOIN agents a ON a.id = c.agent_id
               JOIN users  u ON u.id = a.user_id
              WHERE c.archived_at IS NULL
                AND c.next_step_at IS NOT NULL
                AND c.next_step_at <= CURRENT_DATE
              ORDER BY c.agent_id, c.next_step_at ASC`
        );
        if (!rows.length) return { agents: 0, sent: 0 };
        const byAgent = new Map();
        for (const r of rows) {
            if (!byAgent.has(r.agent_id)) byAgent.set(r.agent_id, { email: r.agent_email, name: r.display_name, items: [] });
            byAgent.get(r.agent_id).items.push(r);
        }
        const email = require('../services/email');
        for (const [, ag] of byAgent) {
            if (!ag.email) continue;
            const list = ag.items.map(i => {
                const d = new Date(i.next_step_at);
                const overdue = d < new Date(new Date().toDateString());
                return `<li style="margin:0 0 8px;"><strong>${(i.name || 'Contact')}</strong> — ${i.next_step_note || 'follow up'}${overdue ? ' <span style="color:#c05621;font-weight:700;">(overdue)</span>' : ' <span style="color:#2f855a;">(today)</span>'}</li>`;
            }).join('');
            try {
                await email.sendEmail({
                    to: ag.email,
                    subject: `${ag.items.length} follow-up${ag.items.length === 1 ? '' : 's'} due in your MN Lake Homes portal`,
                    html: email.layout({
                        title: `Your follow-ups for today`,
                        preheader: `${ag.items.length} contact${ag.items.length === 1 ? '' : 's'} need a next step.`,
                        body: `<p style="margin:0 0 14px;font-size:15px;color:#2d3748;">Here's who's due a next step:</p><ul style="margin:0 0 16px;padding-left:18px;font-size:15px;color:#2d3748;">${list}</ul>`,
                        ctaText: 'Open my contacts',
                        ctaUrl: `${process.env.SITE_URL || 'https://minnesotalakehomesforsale.com'}/pages/agent/dashboard.html`,
                    })
                });
                sent++;
            } catch (e) { console.warn('[contacts.digest] send failed:', e.message); }
        }
        // Stamp the day so we don't re-send (JSONB column → store as JSON string).
        const today2 = new Date().toISOString().slice(0, 10);
        await pool.query(
            `INSERT INTO app_config (key, value, description) VALUES ('contact_digest_last_date', to_jsonb($1::text), 'Last date the agent contact next-step digest ran')
             ON CONFLICT (key) DO UPDATE SET value = to_jsonb($1::text), updated_at = NOW()`,
            [today2]
        );
        return { agents: byAgent.size, sent };
    } catch (e) {
        console.error('[contacts.runContactReminderDigest]', e.message);
        return { agents: 0, sent, error: e.message };
    }
};
