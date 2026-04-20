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

// All /api/tags/* endpoints require a session. Role-level gates live
// inside each controller (admin-only vs. self-or-admin for user tags).
router.use(verifyToken);

// Tag catalog
router.get('/',  c.list);
router.post('/', c.create);

// User↔tag association (more specific than /:id — register first)
router.get   ('/users/:userId',         c.listForUser);
router.put   ('/users/:userId',         c.replaceForUser);
router.post  ('/users/:userId',         c.attachToUser);
router.delete('/users/:userId/:tagId',  c.detachFromUser);

// Proximity match
router.post('/match', c.match);

// Single-tag mutations (LAST, after specific paths)
router.patch ('/:id', c.patch);
router.delete('/:id', c.softDelete);

module.exports = router;
