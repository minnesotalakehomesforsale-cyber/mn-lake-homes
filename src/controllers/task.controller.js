const pool = require('../database/pool');

// Helper: parse an ISO-ish date string or null
function parseDueDate(v) {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

const getTasks = async (req, res) => {
    const sort = (req.query.sort || 'smart').toLowerCase();

    // "smart" = pending first, overdue → today → upcoming (by due_date ASC, nulls last), then created DESC
    // "due"   = by due_date ASC (nulls last), then created DESC
    // "created" = by created_at DESC
    // priority rank so High floats up: high=0, normal=1, low=2
    const PRIO = `CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`;
    let orderClause;
    if (sort === 'due') {
        orderClause = `is_completed ASC, due_date ASC NULLS LAST, created_at DESC`;
    } else if (sort === 'created') {
        orderClause = `is_completed ASC, created_at DESC`;
    } else if (sort === 'priority') {
        orderClause = `is_completed ASC, ${PRIO} ASC, due_date ASC NULLS LAST, created_at DESC`;
    } else {
        orderClause = `is_completed ASC, ${PRIO} ASC, (due_date IS NULL) ASC, due_date ASC, created_at DESC`;
    }

    try {
        const { rows } = await pool.query(
            `SELECT id, note, details, due_date, is_completed, completed_at, created_at,
                    COALESCE(priority,'normal') AS priority, category
             FROM admin_tasks
             ORDER BY ${orderClause}`
        );
        res.json(rows);
    } catch (err) {
        console.error('[getTasks]', err.message);
        res.status(500).json({ error: 'Failed to fetch tasks.' });
    }
};

// GET /api/tasks/counts — for sidebar/nav badge
const getTaskCounts = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE is_completed = false AND due_date IS NOT NULL AND due_date < NOW())              AS overdue,
                COUNT(*) FILTER (WHERE is_completed = false AND due_date IS NULL)                                       AS no_date,
                COUNT(*) FILTER (WHERE is_completed = false AND due_date IS NOT NULL
                                  AND due_date >= date_trunc('day', NOW())
                                  AND due_date <  date_trunc('day', NOW()) + INTERVAL '1 day')                        AS due_today,
                COUNT(*) FILTER (WHERE is_completed = false)                                                           AS pending
            FROM admin_tasks
        `);
        const r = rows[0];
        const overdue   = parseInt(r.overdue, 10)   || 0;
        const no_date   = parseInt(r.no_date, 10)   || 0;
        const due_today = parseInt(r.due_today, 10) || 0;
        const pending   = parseInt(r.pending, 10)   || 0;
        // Sidebar badge: "needs attention" = past-due OR missing a due date.
        // Tasks scheduled for the future stay quiet until they actually hit
        // their date — admin wants the badge actionable, not noisy.
        res.json({ overdue, no_date, due_today, pending, attention: overdue + no_date });
    } catch (err) {
        console.error('[getTaskCounts]', err.message);
        res.status(500).json({ error: 'Failed to fetch task counts.' });
    }
};

const normPriority = v => (['low', 'normal', 'high'].includes(v) ? v : 'normal');
const normCategory = v => (v && String(v).trim() ? String(v).trim().slice(0, 40) : null);

const createTask = async (req, res) => {
    const { note, details, due_date, priority, category } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ error: 'Note is required.' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO admin_tasks (note, details, due_date, priority, category)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [note.trim(), details?.trim() || null, parseDueDate(due_date), normPriority(priority), normCategory(category)]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[createTask]', err.message);
        res.status(500).json({ error: 'Failed to create task.' });
    }
};

// PATCH /:id — unified update: note, details, due_date, is_completed
// If no body keys provided, falls back to toggling is_completed (backward compatible).
const updateTask = async (req, res) => {
    const { note, details, due_date, is_completed, priority, category } = req.body || {};
    const hasAny = [note, details, due_date, is_completed, priority, category].some(v => v !== undefined);

    try {
        if (!hasAny) {
            // Backward-compatible toggle behavior (no body)
            const { rows } = await pool.query(
                `UPDATE admin_tasks
                 SET is_completed = NOT is_completed,
                     completed_at = CASE WHEN NOT is_completed THEN NOW() ELSE NULL END
                 WHERE id = $1 RETURNING *`,
                [req.params.id]
            );
            if (!rows.length) return res.status(404).json({ error: 'Task not found.' });
            return res.json(rows[0]);
        }

        const { rows } = await pool.query(
            `UPDATE admin_tasks
             SET note         = COALESCE($1, note),
                 details      = CASE WHEN $2::text IS NOT NULL THEN NULLIF($2, '__null__') ELSE details END,
                 due_date     = CASE WHEN $3::text IS NOT NULL THEN NULLIF($3, '__null__')::timestamptz ELSE due_date END,
                 is_completed = COALESCE($4, is_completed),
                 priority     = COALESCE($6, priority),
                 category     = CASE WHEN $7::text IS NOT NULL THEN NULLIF($7, '__null__') ELSE category END,
                 completed_at = CASE
                                   WHEN $4 IS TRUE  AND is_completed = false THEN NOW()
                                   WHEN $4 IS FALSE                          THEN NULL
                                   ELSE completed_at
                                END
             WHERE id = $5
             RETURNING *`,
            [
                note !== undefined ? (note?.trim() || null) : null,
                details !== undefined ? (details === null || details === '' ? '__null__' : details.trim()) : null,
                due_date !== undefined ? (due_date === null || due_date === '' ? '__null__' : parseDueDate(due_date)) : null,
                typeof is_completed === 'boolean' ? is_completed : null,
                req.params.id,
                priority !== undefined ? normPriority(priority) : null,
                category !== undefined ? (category === null || category === '' ? '__null__' : normCategory(category)) : null,
            ]
        );
        if (!rows.length) return res.status(404).json({ error: 'Task not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[updateTask]', err.message);
        res.status(500).json({ error: 'Failed to update task.' });
    }
};

const deleteTask = async (req, res) => {
    try {
        await pool.query(`DELETE FROM admin_tasks WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('[deleteTask]', err.message);
        res.status(500).json({ error: 'Failed to delete task.' });
    }
};

module.exports = { getTasks, getTaskCounts, createTask, updateTask, deleteTask };
