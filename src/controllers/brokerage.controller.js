/**
 * brokerage.controller.js — the brokerage catalog behind the agent-profile
 * "Brokerage" combobox.
 *
 *   GET /api/brokerages?q=<text>   → filtered, alphabetical option list
 *
 * "Type-to-add" is intentionally NOT a public write endpoint. When an agent
 * saves a profile (or registers) with a brokerage name that isn't in the
 * catalog yet, the save path calls `reconcileBrokerage()` below, which inserts
 * the new row (source:'agent', status:'pending') and files an admin task for
 * review. That keeps the only write behind an authenticated, rate-limited save.
 */
const pool = require('../database/pool');

// GET /api/brokerages?q= — public. Returns active + pending (agent-added) rows
// so a just-added brokerage shows up immediately, but hidden ones stay out.
exports.list = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim().toLowerCase();
        const params = [];
        let where = `status <> 'hidden'`;
        if (q) {
            params.push(`%${q}%`);
            where += ` AND lower(name) LIKE $${params.length}`;
        }
        const { rows } = await pool.query(
            `SELECT id, name, status
               FROM brokerages
              WHERE ${where}
              ORDER BY name ASC
              LIMIT 400`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('[brokerages.list]', err.message);
        res.status(500).json({ error: 'Failed to load brokerages.' });
    }
};

/**
 * reconcileBrokerage(name, meta) — call from a save path (agent profile save,
 * registration). If `name` is a non-empty brokerage that isn't already in the
 * catalog, insert it (source:'agent', status:'pending') and file an admin task.
 * Fully best-effort and swallow-safe: a catalog hiccup must never break a save.
 *
 * Returns { added: boolean } for logging; callers can ignore it.
 */
exports.reconcileBrokerage = async (name, meta = {}) => {
    const clean = String(name || '').trim();
    if (!clean || clean.length < 2 || clean.length > 200) return { added: false };
    try {
        const ins = await pool.query(
            `INSERT INTO brokerages (name, source, status)
             VALUES ($1, 'agent', 'pending')
             ON CONFLICT (lower(name)) DO NOTHING
             RETURNING id`,
            [clean]
        );
        if (!ins.rowCount) return { added: false }; // already known — nothing to do
        // File an admin task so staff can vet the new brokerage (spelling,
        // duplicate-of-existing, legitimacy).
        try {
            const who = meta.agentName ? ` (added by ${meta.agentName})` : '';
            await pool.query(
                `INSERT INTO admin_tasks (note, details, priority, category)
                 VALUES ($1, $2, 'normal', 'brokerage')`,
                [
                    `Review new brokerage: "${clean}"`,
                    `An agent typed a brokerage that wasn't in the catalog${who}. Confirm the name/spelling, merge any duplicate, or hide it. Manage in Metrics & Database.`,
                ]
            );
        } catch (_) { /* task table optional — don't fail the save */ }
        return { added: true };
    } catch (err) {
        console.warn('[brokerages.reconcile]', err.message);
        return { added: false };
    }
};

/**
 * notifyBrokerageBlank(agentId, agentName) — file a low-priority admin task
 * when an agent publishes/saves without any brokerage on file, so staff can
 * follow up. De-duplicated per agent via a marker task category+note so we
 * don't spam a task on every autosave.
 */
exports.notifyBrokerageBlank = async (agentId, agentName) => {
    try {
        const note = `Agent has no brokerage on file: ${agentName || agentId}`;
        const dup = await pool.query(
            `SELECT 1 FROM admin_tasks
              WHERE category = 'brokerage_blank' AND note = $1 AND is_completed = false
              LIMIT 1`,
            [note]
        );
        if (dup.rowCount) return;
        await pool.query(
            `INSERT INTO admin_tasks (note, details, priority, category)
             VALUES ($1, $2, 'low', 'brokerage_blank')`,
            [note, 'The agent left the Brokerage field blank ("I don\'t know"). Reach out to confirm their brokerage for the public profile.']
        );
    } catch (_) { /* best-effort */ }
};
