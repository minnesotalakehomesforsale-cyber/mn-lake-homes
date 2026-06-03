/**
 * tag.routes.js — /api/tags
 *
 * Mount in src/server.js:
 *   app.use('/api/tags', require('./routes/tag.routes'));
 *
 * Route order matters — /users/:userId and /match must come before
 * /:id so Express doesn't try to match them as tag ids.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/tag.controller');

// Soft auth: decode the JWT if present, attach req.user, but never reject.
// Anonymous callers fall through untouched and the controller treats them
// as public. Mirrors lake.routes.js — needed so admin-aware filtering in
// the tag controller (e.g. opening archived/inactive towns in entity-edit)
// actually sees req.user. Without it, every GET hit the controller as
// "anonymous" and admins got the same 404 as public visitors.
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

// PUBLIC — the tag catalog is a static list of cities/towns. The
// signup overlay needs it before any auth exists, and there's no
// reason to gate read-only metadata. softAuth still attaches req.user
// when an admin is logged in so the controller can include archived
// towns in the response.
router.get('/', softAuth, c.list);

// Everything below requires a valid session cookie. Role-level gates
// (admin-only vs. self-or-admin) live inside each controller.
router.post  ('/',                      verifyToken, c.create);
// Static path — must come before /:slugOrId so Express doesn't try to
// look up a tag with slug "upload-image".
router.post  ('/upload-image',          verifyToken, c.uploadImage);
router.get   ('/users/:userId',         verifyToken, c.listForUser);
router.put   ('/users/:userId',         verifyToken, c.replaceForUser);
router.post  ('/users/:userId',         verifyToken, c.attachToUser);
router.delete('/users/:userId/:tagId',  verifyToken, c.detachFromUser);
router.post  ('/match',                 verifyToken, c.match);

// Public single-tag + reverse-lookup. Placed after the more-specific
// /users/* and /match routes so they take precedence over :slugOrId.
// softAuth on /:slugOrId so the admin's identity flows through to
// tag.getOne — without it, admins couldn't open archived towns from
// entity-edit (the controller's isAdmin(req) check would be false).
router.get   ('/:slugOrId/lakes',                    c.listLakesForTag);
router.get   ('/:slugOrId/blog-posts',               c.listBlogPostsForTag);
router.get   ('/:slugOrId/agents',                   c.listAgentsForTag);
router.get   ('/:slugOrId/businesses',               c.listBusinessesForTag);
router.get   ('/:slugOrId',                softAuth, c.getOne);

router.patch ('/:id',                   verifyToken, c.patch);
router.delete('/:id',                   verifyToken, c.softDelete);

module.exports = router;
