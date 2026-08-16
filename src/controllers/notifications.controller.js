/**
 * notifications.controller.js — agent in-app notification centre (#11).
 * Routes mounted under /api/agents/me/notifications.
 */
const pool = require('../database/pool');

async function agentIdFor(userId) {
    const r = await pool.query(`SELECT id FROM agents WHERE user_id = $1 LIMIT 1`, [userId]);
    return r.rows[0]?.id || null;
}

// GET /api/agents/me/notifications — recent list + unread count.
exports.list = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        const { rows } = await pool.query(
            `SELECT id, type, title, body, link, read_at, created_at
               FROM agent_notifications
              WHERE agent_id = $1
              ORDER BY created_at DESC
              LIMIT 40`,
            [agentId]
        );
        const unread = rows.filter(n => !n.read_at).length;
        res.json({ notifications: rows, unread });
    } catch (e) {
        console.error('[notifications.list]', e.message);
        res.status(500).json({ error: 'Failed to load notifications.' });
    }
};

// GET /api/agents/me/notifications/unread-count — cheap poll target.
exports.unreadCount = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.json({ count: 0 });
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count FROM agent_notifications WHERE agent_id = $1 AND read_at IS NULL`,
            [agentId]
        );
        res.json({ count: rows[0].count });
    } catch (e) {
        console.error('[notifications.unreadCount]', e.message);
        res.json({ count: 0 });
    }
};

// POST /api/agents/me/notifications/mark-read  (all, or {id})
exports.markRead = async (req, res) => {
    try {
        const agentId = await agentIdFor(req.user.userId);
        if (!agentId) return res.status(403).json({ error: 'No agent profile yet.' });
        if (req.body?.id) {
            await pool.query(`UPDATE agent_notifications SET read_at = NOW() WHERE agent_id = $1 AND id = $2 AND read_at IS NULL`, [agentId, req.body.id]);
        } else {
            await pool.query(`UPDATE agent_notifications SET read_at = NOW() WHERE agent_id = $1 AND read_at IS NULL`, [agentId]);
        }
        res.json({ success: true });
    } catch (e) {
        console.error('[notifications.markRead]', e.message);
        res.status(500).json({ error: 'Failed to update notifications.' });
    }
};
