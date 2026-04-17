const pool = require('../database/pool');

/**
 * GET /api/activity
 * Query params:
 *   scope        — filter by event_scope (comma-separated ok)
 *   severity     — info | warning | error
 *   search       — substring search against event_type/actor_label/target_label
 *   actor_id     — filter by specific actor
 *   limit        — default 100, max 500
 *   before       — ISO timestamp for pagination (returns rows created_at < before)
 */
const getActivity = async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const clauses = [];
    const params = [];

    if (req.query.scope) {
        const scopes = req.query.scope.split(',').map(s => s.trim()).filter(Boolean);
        if (scopes.length) {
            params.push(scopes);
            clauses.push(`event_scope = ANY($${params.length})`);
        }
    }
    if (req.query.severity) {
        params.push(req.query.severity);
        clauses.push(`severity = $${params.length}`);
    }
    if (req.query.search) {
        params.push('%' + req.query.search + '%');
        const i = params.length;
        clauses.push(`(event_type ILIKE $${i} OR actor_label ILIKE $${i} OR target_label ILIKE $${i})`);
    }
    if (req.query.actor_id) {
        params.push(req.query.actor_id);
        clauses.push(`actor_id = $${params.length}`);
    }
    if (req.query.before) {
        params.push(req.query.before);
        clauses.push(`created_at < $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    try {
        const { rows } = await pool.query(
            `SELECT id, event_type, event_scope, actor_type, actor_id, actor_label,
                    target_type, target_id, target_label, details,
                    ip_address, severity, created_at
             FROM activity_log
             ${where}
             ORDER BY created_at DESC
             LIMIT ${limit}`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('[getActivity]', err.message);
        res.status(500).json({ error: 'Failed to fetch activity log.' });
    }
};

/**
 * GET /api/activity/summary
 * Returns health + counters for the admin dashboard card.
 */
const getSummary = async (req, res) => {
    const out = {
        db_connected: false,
        uptime_seconds: Math.floor(process.uptime()),
        node_version: process.version,
        memory_rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        environment: process.env.NODE_ENV || 'local',
        tables: {},
        last_24h: { total: 0, errors: 0, warnings: 0, by_scope: {} },
        recent_errors: [],
    };

    try {
        const ping = await pool.query(`SELECT 1 AS ok`);
        out.db_connected = ping.rows[0].ok === 1;
    } catch (err) {
        out.db_connected = false;
        out.db_error = err.message;
    }

    const tables = ['agents', 'leads', 'users', 'blog_posts', 'admin_tasks', 'contact_inquiries', 'activity_log'];
    for (const t of tables) {
        try {
            const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
            out.tables[t] = r.rows[0].c;
        } catch (err) {
            out.tables[t] = null;
        }
    }

    try {
        const { rows } = await pool.query(`
            SELECT severity, event_scope, COUNT(*)::int AS c
            FROM activity_log
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            GROUP BY severity, event_scope
        `);
        for (const r of rows) {
            out.last_24h.total += r.c;
            if (r.severity === 'error')   out.last_24h.errors   += r.c;
            if (r.severity === 'warning') out.last_24h.warnings += r.c;
            if (r.event_scope) {
                out.last_24h.by_scope[r.event_scope] = (out.last_24h.by_scope[r.event_scope] || 0) + r.c;
            }
        }
    } catch (_) { /* table may not exist yet */ }

    try {
        const { rows } = await pool.query(`
            SELECT id, event_type, event_scope, actor_label, target_label, details, created_at
            FROM activity_log
            WHERE severity = 'error'
            ORDER BY created_at DESC
            LIMIT 10
        `);
        out.recent_errors = rows;
    } catch (_) { /* table may not exist yet */ }

    res.json(out);
};

module.exports = { getActivity, getSummary };
