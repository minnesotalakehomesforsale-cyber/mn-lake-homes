const jwt = require('jsonwebtoken');

// Verify standard Authorization or HTTP Only Cookie
const verifyToken = (req, res, next) => {
    let token = req.cookies?.auth_session;
    
    // Fallback exactly for Postman/API test testing via headers
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ error: 'Access Denied / Unauthorized Request' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Mounts { userId, role } globally to the request
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or Expired Token' });
    }
};

// RBAC Middleware
const requireRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.user || req.user.role !== requiredRole) {
            return res.status(403).json({ error: 'Forbidden: Insufficient Permissions' });
        }
        next();
    };
};

module.exports = { verifyToken, requireRole };
