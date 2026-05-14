/**
 * resource.routes.js — /api/resources
 *
 * Mount in src/server.js:
 *   app.use('/api/resources', require('./routes/resource.routes'));
 *
 * Read endpoints are public. Write endpoints (create/update/delete)
 * will land here once the admin CRUD UI ships; for v1 admin is
 * read-only via GET /api/resources?active=all.
 */

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const c       = require('../controllers/resource.controller');
const { verifyToken } = require('../middleware/auth');

// Soft auth — if a valid session cookie is present we attach req.user
// so the controller can unlock admin-only query params (e.g.
// ?active=all). Missing or invalid tokens just continue as public
// so anonymous visitors still get reads.
function softAuth(req, res, next) {
    const token = req.cookies?.auth_session;
    if (!token) return next();
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) { /* fall through as anonymous */ }
    next();
}

router.get('/categories', softAuth, c.categories);
// Email-gated download capture — public, no account needed. Sits before
// /:slug so the "download" segment isn't read as a slug.
router.post('/:slug/download', c.captureDownload);
router.get('/:slug',      softAuth, c.detail);
router.get('/',           softAuth, c.list);

// Admin write — hard delete a resource.
router.delete('/:id', verifyToken, c.remove);

module.exports = router;
