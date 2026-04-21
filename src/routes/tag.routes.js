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
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/tag.controller');

// PUBLIC — the tag catalog is a static list of cities/towns. The
// signup overlay needs it before any auth exists, and there's no
// reason to gate read-only metadata.
router.get('/', c.list);

// Everything below requires a valid session cookie. Role-level gates
// (admin-only vs. self-or-admin) live inside each controller.
router.post  ('/',                      verifyToken, c.create);
router.get   ('/users/:userId',         verifyToken, c.listForUser);
router.put   ('/users/:userId',         verifyToken, c.replaceForUser);
router.post  ('/users/:userId',         verifyToken, c.attachToUser);
router.delete('/users/:userId/:tagId',  verifyToken, c.detachFromUser);
router.post  ('/match',                 verifyToken, c.match);

// Public single-tag + reverse-lookup. Placed after the more-specific
// /users/* and /match routes so they take precedence over :slugOrId.
router.get   ('/:slugOrId/lakes',                    c.listLakesForTag);
router.get   ('/:slugOrId',                          c.getOne);

router.patch ('/:id',                   verifyToken, c.patch);
router.delete('/:id',                   verifyToken, c.softDelete);

module.exports = router;
