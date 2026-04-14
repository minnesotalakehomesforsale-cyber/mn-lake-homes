/**
 * PHASE 3: AUTHENTICATION & RBAC MIDDLEWARE (SCAFFOLD)
 * 
 * This middleware verifies incoming JWT cookies and enforces array-based Role guards.
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-development-only';

/**
 * verifySession
 * Parses the JWT cookie and attaches the user payload to the Express Request object.
 */
exports.verifySession = (req, res, next) => {
    // Note: requires cookie-parser middleware configured in Express
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No active session provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // decoded looks like: { userId: 'uuid', role: 'agent', iat: 123... }
        req.user = decoded;
        next();
    } catch (ex) {
        return res.status(401).json({ error: 'Invalid or expired session.' });
    }
};

/**
 * requireRole
 * Extends the verifySession middleware by checking the parsed req.user.role 
 * against an array of explicitly authorized roles defined at the route level.
 * 
 * Usage example:
 * router.get('/leads/all', verifySession, requireRole(['super_admin', 'admin']), leadController.getAll);
 * router.patch('/agent/profile', verifySession, requireRole(['agent', 'admin', 'super_admin']), agentController.update);
 */
exports.requireRole = (allowedRoles = []) => {
    return (req, res, next) => {
        // verifySession must run before this to populate req.user
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Authentication required for role verification.' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Forbidden. Your role does not possess permissions to execute this request.' 
            });
        }

        next();
    };
};
