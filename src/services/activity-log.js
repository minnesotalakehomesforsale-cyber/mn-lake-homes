/**
 * Site-wide activity logger.
 * Write an entry to `activity_log` whenever something meaningful happens
 * (agent login, lead created, status changed, record deleted, etc.).
 *
 * All failures are swallowed — logging must NEVER break the actual operation.
 */
const pool = require('../database/pool');

/**
 * @param {Object} args
 * @param {string} args.event_type   e.g. 'auth.login', 'agent.update', 'lead.create'
 * @param {string} [args.event_scope] e.g. 'auth', 'agent', 'lead', 'inquiry', 'user', 'blog', 'system', 'task'
 * @param {{type?:string,id?:string,label?:string}} [args.actor]   who did it
 * @param {{type?:string,id?:string,label?:string}} [args.target]  what it was done to
 * @param {Object} [args.details]    arbitrary JSON payload (changed fields, reason, etc.)
 * @param {'info'|'warning'|'error'} [args.severity='info']
 * @param {import('express').Request} [args.req] if present, captures ip + user-agent
 */
async function logActivity(args = {}) {
    try {
        const {
            event_type,
            event_scope = null,
            actor = {},
            target = {},
            details = null,
            severity = 'info',
            req = null,
        } = args;

        if (!event_type) return;

        await pool.query(
            `INSERT INTO activity_log (event_type, event_scope, actor_type, actor_id, actor_label,
                                       target_type, target_id, target_label, details,
                                       ip_address, user_agent, severity)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
                event_type,
                event_scope,
                actor?.type || null,
                actor?.id || null,
                actor?.label || null,
                target?.type || null,
                target?.id || null,
                target?.label || null,
                details ? JSON.stringify(details) : null,
                req?.ip || req?.headers?.['x-forwarded-for'] || null,
                req?.headers?.['user-agent'] || null,
                severity,
            ]
        );
    } catch (err) {
        // Never let a logging failure take down the caller.
        console.error('[activityLog] failed:', err.message);
    }
}

/** Convenience helper for catching thrown errors anywhere and persisting them. */
async function logError(err, context = {}) {
    await logActivity({
        event_type: context.event_type || 'system.error',
        event_scope: context.event_scope || 'system',
        severity: 'error',
        details: {
            message: err?.message || String(err),
            stack: err?.stack ? err.stack.split('\n').slice(0, 6).join('\n') : null,
            ...context.details,
        },
        actor: context.actor,
        target: context.target,
        req: context.req,
    });
}

module.exports = { logActivity, logError };
