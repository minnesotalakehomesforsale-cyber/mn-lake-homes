const express = require('express');
const router = express.Router();
const c = require('../controllers/listing.controller');
const { verifyToken } = require('../middleware/auth');

// ─── PUBLIC ───────────────────────────────────────────────────────────────
router.get('/', c.listPublic);            // ?lake_id=&limit= → active listings
router.get('/slug/:slug', c.getBySlug);   // single active listing (JSON)

// ─── ADMIN ────────────────────────────────────────────────────────────────
router.get('/admin',        verifyToken, c.listAdmin);
router.post('/admin',       verifyToken, c.create);
router.put('/admin/:id',    verifyToken, c.update);
router.delete('/admin/:id', verifyToken, c.remove);

module.exports = router;
