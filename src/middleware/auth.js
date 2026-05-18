const jwt = require('jsonwebtoken');

// We can't blocklist arbitrary JWTs without a token store. Instead, every
// JWT carries a `pwd_iat` claim equal to the user's password_changed_at
// at issue time. If the user later resets their password, the next call
// queries the live password_changed_at and rejects any token where
// pwd_iat < password_changed_at. Effectively the reset rotates the
// implicit signing key for that user, invalidating every prior session.
let _pool = null;
function getPool() {
    if (_pool) return _pool;
    try { _pool = require('../database/pool'); } catch (_) { _pool = null; }
    return _pool;
}

/**
 * verifyToken
 * Attaches the decoded JWT payload to req.user. Prefers an explicit
 * Authorization: Bearer header (API testing + admin impersonation tabs)
 * and falls back to the HttpOnly auth_session cookie set at login.
 *
 * Also enforces password-rotation invalidation: any token whose pwd_iat
 * is older than the user's current password_changed_at is rejected.
 */
const verifyToken = async (req, res, next) => {
    let token = null;
    if (req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) token = req.cookies?.auth_session;

    if (!token) {
        return res.status(401).json({ error: 'Access Denied — No active session.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    // Cheap DB lookup to enforce password-rotation invalidation. Skipped
    // when the token doesn't carry pwd_iat (legacy tokens issued before
    // this commit) — they continue to work until their 24h expiry, then
    // a re-login mints a token with the new claim.
    if (decoded.pwd_iat) {
        const pool = getPool();
        if (pool) {
            try {
                const r = await pool.query(
                    `SELECT EXTRACT(EPOCH FROM password_changed_at)::bigint AS pwd_iat
                       FROM users WHERE id = $1 LIMIT 1`,
                    [decoded.userId]
                );
                const liveIat = r.rows[0]?.pwd_iat;
                // liveIat is in seconds (epoch). decoded.pwd_iat is too.
                if (liveIat && decoded.pwd_iat < liveIat) {
                    return res.status(401).json({ error: 'Session ended — your password was changed. Please log in again.' });
                }
            } catch (_) {
                // DB hiccup — fail open so a DB blip doesn't lock users
                // out across the whole app. The token signature already
                // validated; password rotation is best-effort defense.
            }
        }
    }

    req.user = decoded; // { userId, role, pwd_iat? }
    next();
};

/**
 * requireRole
 * Accepts a single role string OR an array of allowed roles.
 * Must run after verifyToken.
 *
 * Examples:
 *   requireRole('agent')
 *   requireRole(['admin', 'super_admin'])
 */
const requireRole = (allowedRoles) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Forbidden — your role '${req.user.role}' does not have access to this resource.`
            });
        }

        next();
    };
};

/**
 * attachUserIfPresent
 * Same as verifyToken but doesn't reject when no token is present — just
 * leaves req.user undefined. Use on public endpoints that want to know
 * the caller's identity if they happen to be logged in (e.g. leads).
 */
const attachUserIfPresent = (req, res, next) => {
    let token = null;
    if (req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) token = req.cookies?.auth_session;
    if (!token) return next();
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
        // Bad/expired token on a public route — just continue anonymously.
    }
    next();
};

module.exports = { verifyToken, requireRole, attachUserIfPresent };
