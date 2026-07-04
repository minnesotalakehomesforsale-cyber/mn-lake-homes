const express = require('express');
const router = express.Router();
const c = require('../controllers/listing.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── PUBLIC ───────────────────────────────────────────────────────────────
router.get('/', c.listPublic);            // ?lake_id=&limit= → active listings
router.get('/map', c.mapListings);        // active + geocoded → Properties map
router.get('/sold', c.soldRecent);        // recently sold → social-proof wall
router.get('/slug/:slug', c.getBySlug);   // single active listing (JSON)

// ─── AGENT (own properties) — instant-live, scoped to the caller's agent ────
router.get   ('/mine',            verifyToken, requireRole('agent'), c.listMine);
router.post  ('/mine',            verifyToken, requireRole('agent'), c.createMine);
router.post  ('/mine/upload',     verifyToken, requireRole('agent'), c.uploadMine);
router.put   ('/mine/:id',        verifyToken, requireRole('agent'), c.updateMine);
router.patch ('/mine/:id/status', verifyToken, requireRole('agent'), c.setStatusMine);
router.delete('/mine/:id',        verifyToken, requireRole('agent'), c.removeMine);

// ─── SAVED / LIKED (any signed-in user) ─────────────────────────────────────
router.get ('/saved/mine', verifyToken, c.listSaved);
router.get ('/saved/ids',  verifyToken, c.savedIds);
router.post('/:id/save',   verifyToken, c.toggleSave);

// ─── ADMIN ────────────────────────────────────────────────────────────────
router.get('/admin',            verifyToken, c.listAdmin);
router.get('/admin/by-agent/:agentId',     verifyToken, c.listForAgent);   // an agent's listings
router.get('/admin/saved-by-user/:userId', verifyToken, c.savedForUser);   // a user's saved props
router.post('/admin/upload',    verifyToken, c.uploadImages);   // Cloudinary image upload
router.post('/admin/import',    verifyToken, c.importBatch);    // bulk upsert (CSV/JSON)
router.post('/admin/sync-feed', verifyToken, c.syncFeed);       // pull from RESO/MLS feed
router.get('/admin/:id',        verifyToken, c.getAdmin);
router.post('/admin',           verifyToken, c.create);
router.put('/admin/:id',        verifyToken, c.update);
router.patch('/admin/:id/status', verifyToken, c.setStatus);
router.delete('/admin/:id',     verifyToken, c.remove);

module.exports = router;
