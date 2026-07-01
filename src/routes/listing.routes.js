const express = require('express');
const router = express.Router();
const c = require('../controllers/listing.controller');
const { verifyToken } = require('../middleware/auth');

// ─── PUBLIC ───────────────────────────────────────────────────────────────
router.get('/', c.listPublic);            // ?lake_id=&limit= → active listings
router.get('/slug/:slug', c.getBySlug);   // single active listing (JSON)

// ─── ADMIN ────────────────────────────────────────────────────────────────
router.get('/admin',            verifyToken, c.listAdmin);
router.post('/admin/upload',    verifyToken, c.uploadImages);   // Cloudinary image upload
router.post('/admin/import',    verifyToken, c.importBatch);    // bulk upsert (CSV/JSON)
router.post('/admin/sync-feed', verifyToken, c.syncFeed);       // pull from RESO/MLS feed
router.get('/admin/:id',        verifyToken, c.getAdmin);
router.post('/admin',           verifyToken, c.create);
router.put('/admin/:id',        verifyToken, c.update);
router.delete('/admin/:id',     verifyToken, c.remove);

module.exports = router;
