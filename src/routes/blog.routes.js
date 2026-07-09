const express = require('express');
const router = express.Router();
const blog = require('../controllers/blog.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// Admin-only guard (same as the rest of the admin API). Sits in front of every
// write/manage route so these can't be called without a valid admin session.
const adminOnly = [verifyToken, requireRole(['admin', 'super_admin'])];

// ─── Public (read-only) ─────────────────────────────────────────────────────
router.get('/', blog.getPublished);

// ─── Admin: list ALL posts incl. drafts — MUST come before /:slug ───────────
router.get('/admin/all', ...adminOnly, blog.getAll);
router.post('/admin/upload-image', ...adminOnly, blog.uploadImage);

// Public single post by slug (registered after the /admin/* routes above).
router.get('/:slug', blog.getBySlug);

// ─── Admin CRUD — now behind admin auth (previously open to the internet) ────
router.post('/admin', ...adminOnly, blog.createPost);
router.patch('/admin/:id', ...adminOnly, blog.updatePost);
router.delete('/admin/:id', ...adminOnly, blog.deletePost);

module.exports = router;
