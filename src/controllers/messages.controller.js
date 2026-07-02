/**
 * messages.controller.js — one-way admin → agent in-app messages.
 *
 * Admin endpoints (mounted under /api/admin, admin-gated):
 *   POST /api/admin/messages                 send a message to an agent
 *   GET  /api/admin/messages/threads         agents + last message + counts
 *   GET  /api/admin/messages/agent/:userId   full thread for one agent
 *   DELETE /api/admin/messages/:id           remove a message
 *
 * Agent endpoints (mounted under /api/agents, agent-gated):
 *   GET  /api/agents/me/messages             my messages (newest first)
 *   GET  /api/agents/me/messages/unread-count
 *   POST /api/agents/me/messages/mark-read   mark all mine as read
 *
 * Agents cannot send — there's deliberately no agent write path. The
 * same rows back both the global Messages tab and the per-agent thread
 * inside the agent's admin profile, so they always show identical history.
 */

const pool = require('../database/pool');
const emailService = require('../services/email');
const { logActivity } = require('../services/activity-log');

// Resolve a recipient user → email + first name for the wake-up email.
// Used by send() (single recipient) and broadcast() (loop). Returns null
// silently if the user can't be found / has no email so the message itself
// still lands in the in-app inbox even when the email path is blocked.
async function resolveRecipientForEmail(userId) {
    try {
        const { rows } = await pool.query(
            `SELECT u.email, u.first_name, COALESCE(a.display_name, u.full_name) AS display_name
               FROM users u LEFT JOIN agents a ON a.user_id = u.id
              WHERE u.id = $1 LIMIT 1`,
            [userId]
        );
        return rows[0] || null;
    } catch (_) { return null; }
}

// ─── Admin: send ────────────────────────────────────────────────────────────
exports.send = async (req, res) => {
    const senderId = req.user?.userId || null;
    const recipientUserId = req.body?.recipient_user_id;
    const body = (req.body?.body || '').trim();

    if (!recipientUserId) return res.status(400).json({ error: 'recipient_user_id is required.' });
    if (!body)            return res.status(400).json({ error: 'Message cannot be empty.' });

    try {
        // Recipient must be a real agent account.
        const u = await pool.query(
            `SELECT u.id, COALESCE(a.display_name, u.full_name, u.email) AS name
               FROM users u LEFT JOIN agents a ON a.user_id = u.id
              WHERE u.id = $1 AND u.role = 'agent' AND u.deleted_at IS NULL LIMIT 1`,
            [recipientUserId]
        );
        if (!u.rows.length) return res.status(404).json({ error: 'Agent recipient not found.' });

        const { rows } = await pool.query(
            `INSERT INTO agent_messages (recipient_user_id, sender_user_id, body)
             VALUES ($1, $2, $3)
             RETURNING id, body, created_at, read_at`,
            [recipientUserId, senderId, body.slice(0, 4000)]
        );
        logActivity({
            event_type: 'agent.message.send',
            event_scope: 'messages',
            actor: { type: 'admin', id: senderId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id: recipientUserId, label: u.rows[0].name },
            req,
        });

        // Fire-and-forget wake-up email — gets the agent off the in-app
        // inbox dependency and into their actual mail client.
        (async () => {
            const r = await resolveRecipientForEmail(recipientUserId);
            if (!r?.email) return;
            emailService.sendAgentMessageNotification({
                to: r.email,
                agentFirstName: r.first_name || (r.display_name || '').split(' ')[0] || 'there',
                body,
                senderName: req.user?.display_name || 'the MN Lake Homes team',
            });
        })().catch(err => console.error('[messages.send] notify failed:', err.message));

        res.status(201).json({ success: true, message: rows[0] });
    } catch (err) {
        console.error('[messages.send]', err.message);
        res.status(500).json({ error: 'Failed to send message.' });
    }
};

// ─── Admin: broadcast (mass message to an audience) ─────────────────────────
// Server resolves the audience itself (source of truth) so the client can't
// over- or under-target. One agent_messages row is written per recipient, so
// each lands in that agent's individual thread + portal exactly like a 1:1.
//   body:    { body, audience, tier?, user_ids? }
//   audience: 'all' | 'featured' | 'tier' | 'selected'
exports.broadcast = async (req, res) => {
    const senderId = req.user?.userId || null;
    const body = (req.body?.body || '').trim();
    const audience = (req.body?.audience || 'all').toString();
    const tier = req.body?.tier ? String(req.body.tier) : null;
    const userIds = Array.isArray(req.body?.user_ids) ? req.body.user_ids : [];

    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });

    try {
        let rows;
        if (audience === 'selected') {
            if (!userIds.length) return res.status(400).json({ error: 'Select at least one agent.' });
            rows = (await pool.query(
                `SELECT u.id FROM users u
                  WHERE u.role = 'agent' AND u.deleted_at IS NULL AND u.id = ANY($1::uuid[])`,
                [userIds]
            )).rows;
        } else if (audience === 'featured') {
            rows = (await pool.query(
                `SELECT u.id FROM users u JOIN agents a ON a.user_id = u.id
                  WHERE u.role = 'agent' AND u.deleted_at IS NULL AND a.is_featured = TRUE`
            )).rows;
        } else if (audience === 'tier') {
            if (!tier) return res.status(400).json({ error: 'Pick a membership tier.' });
            rows = (await pool.query(
                `SELECT u.id FROM users u
                   JOIN agents a      ON a.user_id = u.id
                   JOIN memberships m ON m.id = a.membership_id
                  WHERE u.role = 'agent' AND u.deleted_at IS NULL AND m.code = $1`,
                [tier]
            )).rows;
        } else { // 'all'
            rows = (await pool.query(
                `SELECT u.id FROM users u WHERE u.role = 'agent' AND u.deleted_at IS NULL`
            )).rows;
        }

        const ids = rows.map(r => r.id);
        if (!ids.length) return res.status(400).json({ error: 'No agents match that audience.' });

        const ins = await pool.query(
            `INSERT INTO agent_messages (recipient_user_id, sender_user_id, body)
             SELECT uid, $2, $3 FROM UNNEST($1::uuid[]) AS uid
             RETURNING id`,
            [ids, senderId, body.slice(0, 4000)]
        );
        logActivity({
            event_type: 'agent.message.broadcast',
            event_scope: 'messages',
            actor: { type: 'admin', id: senderId, label: req.user?.display_name || 'admin' },
            details: { audience, tier, recipients: ins.rowCount },
            req,
        });

        // Fan out wake-up emails — one per recipient, fire-and-forget. A
        // 50-agent broadcast is well within Gmail SMTP / Resend limits;
        // if we ever exceed those we can switch to BCC batching, but for
        // launch volumes individual sends keep the inbox previews honest.
        (async () => {
            const senderName = req.user?.display_name || 'the MN Lake Homes team';
            for (const userId of ids) {
                try {
                    const r = await resolveRecipientForEmail(userId);
                    if (!r?.email) continue;
                    emailService.sendAgentMessageNotification({
                        to: r.email,
                        agentFirstName: r.first_name || (r.display_name || '').split(' ')[0] || 'there',
                        body,
                        senderName,
                    });
                } catch (err) {
                    console.error('[messages.broadcast] notify failed for', userId, err.message);
                }
            }
        })();

        res.status(201).json({ success: true, sent: ins.rowCount });
    } catch (err) {
        console.error('[messages.broadcast]', err.message);
        res.status(500).json({ error: 'Failed to send broadcast.' });
    }
};

// ─── Admin: thread list (left rail of the Messages tab) ─────────────────────
// Returns every agent who has at least one message, newest activity first,
// plus how many the agent hasn't read yet.
exports.threads = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT u.id AS user_id,
                   COALESCE(a.display_name, u.full_name, u.email) AS name,
                   u.email,
                   COUNT(m.*)::int                                  AS total,
                   COUNT(*) FILTER (WHERE m.read_at IS NULL)::int   AS unread_by_agent,
                   MAX(m.created_at)                                AS last_at,
                   (ARRAY_AGG(m.body ORDER BY m.created_at DESC))[1] AS last_body
              FROM agent_messages m
              JOIN users u  ON u.id = m.recipient_user_id
              LEFT JOIN agents a ON a.user_id = u.id
          GROUP BY u.id, a.display_name, u.full_name, u.email
          ORDER BY last_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[messages.threads]', err.message);
        res.status(500).json({ error: 'Failed to load threads.' });
    }
};

// ─── Admin: full thread for one agent ───────────────────────────────────────
exports.threadForAgent = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT m.id, m.body, m.created_at, m.read_at, m.sender_user_id,
                   COALESCE(s.full_name, s.email, 'Admin') AS sender_name
              FROM agent_messages m
              LEFT JOIN users s ON s.id = m.sender_user_id
             WHERE m.recipient_user_id = $1
          ORDER BY m.created_at ASC
        `, [req.params.userId]);
        res.json(rows);
    } catch (err) {
        console.error('[messages.threadForAgent]', err.message);
        res.status(500).json({ error: 'Failed to load thread.' });
    }
};

// ─── Admin: flip a message's read state ────────────────────────────────────
// Body: { read: boolean }. Sets read_at = NOW() (read=true) or NULL
// (read=false). Lets an admin replay an "unread" notification on the
// agent's portal or close one out without making the agent open it.
exports.setReadState = async (req, res) => {
    const wantRead = !!req.body?.read;
    try {
        const { rows, rowCount } = await pool.query(
            `UPDATE agent_messages
                SET read_at = ${wantRead ? 'COALESCE(read_at, NOW())' : 'NULL'}
              WHERE id = $1
              RETURNING id, recipient_user_id, read_at`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Message not found.' });
        logActivity({
            event_type: 'agent.message.read_state',
            event_scope: 'messages',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id: rows[0].recipient_user_id, label: 'message' },
            details: { message_id: rows[0].id, read: !!rows[0].read_at },
            req,
        });
        res.json({ success: true, id: rows[0].id, read_at: rows[0].read_at });
    } catch (err) {
        console.error('[messages.setReadState]', err.message);
        res.status(500).json({ error: 'Failed to update read state.' });
    }
};

// ─── Admin: delete a message ────────────────────────────────────────────────
exports.remove = async (req, res) => {
    try {
        const { rowCount } = await pool.query(`DELETE FROM agent_messages WHERE id = $1`, [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Message not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[messages.remove]', err.message);
        res.status(500).json({ error: 'Failed to delete message.' });
    }
};

// ─── Agent: my messages ─────────────────────────────────────────────────────
exports.myMessages = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT m.id, m.body, m.created_at, m.read_at,
                   COALESCE(s.full_name, 'MN Lake Homes') AS sender_name
              FROM agent_messages m
              LEFT JOIN users s ON s.id = m.sender_user_id
             WHERE m.recipient_user_id = $1
          ORDER BY m.created_at DESC
        `, [req.user.userId]);
        res.json(rows);
    } catch (err) {
        console.error('[messages.myMessages]', err.message);
        res.status(500).json({ error: 'Failed to load messages.' });
    }
};

// ─── Admin: total unread across every agent ────────────────────────────────
// Powers the sidebar Messages badge — sum of all agent_messages still
// unread by their recipient (read_at IS NULL).
exports.unreadTotal = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count
               FROM agent_messages
              WHERE read_at IS NULL`
        );
        res.json({ count: rows[0].count });
    } catch (err) {
        console.error('[messages.unreadTotal]', err.message);
        res.json({ count: 0 });
    }
};

exports.myUnreadCount = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count FROM agent_messages WHERE recipient_user_id = $1 AND read_at IS NULL`,
            [req.user.userId]
        );
        res.json({ count: rows[0].count });
    } catch (err) {
        console.error('[messages.myUnreadCount]', err.message);
        res.json({ count: 0 });
    }
};

exports.markAllRead = async (req, res) => {
    try {
        await pool.query(
            `UPDATE agent_messages SET read_at = NOW() WHERE recipient_user_id = $1 AND read_at IS NULL`,
            [req.user.userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[messages.markAllRead]', err.message);
        res.status(500).json({ error: 'Failed to mark read.' });
    }
};
