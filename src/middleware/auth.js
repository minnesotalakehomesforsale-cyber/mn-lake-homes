const jwt = require('jsonwebtoken');

/**
 * verifyToken
 * Reads the HttpOnly JWT cookie set at login and attaches the decoded payload to req.user.
 * Falls back to Authorization: Bearer header for API testing.
 */
const verifyToken = (req, res, next) => {
    let token = req.cookies?.auth_session;

    // Fallback for Postman / API testing
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

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

module.exports = { verifyToken, requireRole };
