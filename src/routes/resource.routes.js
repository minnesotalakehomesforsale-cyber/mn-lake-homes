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
const { verifyToken, requireRole } = require('../middleware/auth');

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

// Paid-agent-only resource library. Static segment before /:slug.
router.get('/agent', verifyToken, requireRole('agent'), c.agentResources);

// Admin write + insight endpoints. Static segments here MUST come before
// the /:slug catch-all below so Express doesn't try to look up resources
// with a slug like "upload-image" or "admin".
router.post ('/',                       verifyToken, c.create);
router.post ('/upload-image',           verifyToken, c.uploadImage);
router.get  ('/admin/:id/insights',     verifyToken, c.insights);
router.get  ('/admin/:id/downloads',    verifyToken, c.downloads);

// Email-gated download capture — public, no account needed. Sits before
// /:slug so the "download" segment isn't read as a slug.
router.post('/:slug/download', c.captureDownload);
router.get ('/:slug',      softAuth, c.detail);
router.get ('/',           softAuth, c.list);

router.patch ('/:id', verifyToken, c.patch);
router.delete('/:id', verifyToken, c.remove);

module.exports = router;
