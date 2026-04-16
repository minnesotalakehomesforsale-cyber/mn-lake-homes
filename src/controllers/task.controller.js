const pool = require('../database/pool');

const getTasks = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM admin_tasks ORDER BY is_completed ASC, created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[getTasks]', err.message);
        res.status(500).json({ error: 'Failed to fetch tasks.' });
    }
};

const createTask = async (req, res) => {
    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ error: 'Note is required.' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO admin_tasks (note) VALUES ($1) RETURNING *`,
            [note.trim()]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[createTask]', err.message);
        res.status(500).json({ error: 'Failed to create task.' });
    }
};

const toggleTask = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE admin_tasks
             SET is_completed = NOT is_completed,
                 completed_at = CASE WHEN NOT is_completed THEN NOW() ELSE NULL END
             WHERE id = $1
             RETURNING *`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Task not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[toggleTask]', err.message);
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

module.exports = { getTasks, createTask, toggleTask, deleteTask };
