const jwt = require('jsonwebtoken');

/**
 * verifyToken
 * Attaches the decoded JWT payload to req.user. Prefers an explicit
 * Authorization: Bearer header (API testing + admin impersonation tabs)
 * and falls back to the HttpOnly auth_session cookie set at login.
 */
const verifyToken = (req, res, next) => {
    // Prefer an explicit Authorization header over the ambient session
    // cookie, so an impersonation tab can act as the agent without
    // disturbing the admin's own cookie session in other tabs.
    let token = null;
    if (req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) token = req.cookies?.auth_session;

    if (!token) {
        return res.status(401).json({ error: 'Access Denied — No active session.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { userId, role }
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
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
