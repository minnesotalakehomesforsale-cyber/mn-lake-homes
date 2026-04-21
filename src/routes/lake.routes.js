/**
 * lake.routes.js — /api/lakes
 *
 * Mount in src/server.js:
 *   app.use('/api/lakes', require('./routes/lake.routes'));
 *
 * GET routes use "soft auth": anonymous callers see published lakes;
 * admins (valid token + admin role) see drafts + archived too. Writes
 * require a valid token, with admin-role gating inside each controller.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/lake.controller');

// Soft auth: decode the JWT if present, attach req.user, but never reject.
// Anonymous callers fall through untouched and the controller treats them
// as public. Keeps /api/lakes and /api/lakes/:slug usable from the public
// site without any login.
function softAuth(req, res, next) {
    let token = req.cookies?.auth_session;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return next();
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) { /* ignore — treat as anonymous */ }
    next();
}

// Public reads (with admin-aware filtering via softAuth)
router.get('/',           softAuth, c.list);

// Admin image upload — must sit BEFORE /:slugOrId or the router would
// try to look up a lake with slug "upload-image".
router.post('/upload-image', verifyToken, c.uploadImage);

// Lakes-for-blog-post convenience routes. These expose the join table in
// the "by blog post id" direction so the blog admin editor can load the
// currently-selected lakes when opening an existing post. Kept above
// /:slugOrId for the same reason as upload-image.
router.get('/by-blog-post/:postId',  softAuth,    c.listLakesForBlogPost);
router.put('/by-blog-post/:postId',  verifyToken, c.replaceLakesForBlogPost);

router.get('/:slugOrId',  softAuth, c.getOne);

// Admin writes — verifyToken enforces a valid session; role is checked
// inside each controller function.
router.post  ('/',         verifyToken, c.create);
router.patch ('/:id',      verifyToken, c.patch);
router.delete('/:id',      verifyToken, c.softDelete);

// Agent ↔ lake connections
router.get('/:id/agents',  softAuth,    c.listAgents);
router.put('/:id/agents',  verifyToken, c.replaceAgents);

// Blog post ↔ lake connections (by lake id)
router.get('/:id/blog-posts', softAuth,    c.listBlogPosts);
router.put('/:id/blog-posts', verifyToken, c.replaceBlogPosts);

// Businesses connected to a lake (optional ?type=restaurant filter)
router.get('/:id/businesses', softAuth,    c.listBusinesses);
router.put('/:id/businesses', verifyToken, c.replaceBusinesses);

// Nearby towns (reuses the tags catalog) connected to a lake
router.get('/:id/tags', softAuth,    c.listTags);
router.put('/:id/tags', verifyToken, c.replaceTags);

module.exports = router;
