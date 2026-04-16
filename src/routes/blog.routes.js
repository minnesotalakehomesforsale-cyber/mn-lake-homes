const express = require('express');
const router = express.Router();
const blog = require('../controllers/blog.controller');

// Public
router.get('/', blog.getPublished);
router.get('/admin/all', blog.getAll);           // must come before /:slug
router.post('/admin/upload-image', blog.uploadImage);
router.get('/:slug', blog.getBySlug);

// Admin CRUD (no auth wall per project convention)
router.post('/admin', blog.createPost);
router.patch('/admin/:id', blog.updatePost);
router.delete('/admin/:id', blog.deletePost);

module.exports = router;
