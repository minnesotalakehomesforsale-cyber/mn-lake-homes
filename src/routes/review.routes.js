const express = require('express');
const router = express.Router();
const c = require('../controllers/review.controller');
const { verifyToken } = require('../middleware/auth');

// ─── PUBLIC ───────────────────────────────────────────────────────────────
router.post('/', c.submit);            // submit a review (lands 'pending')
router.get('/', c.listForSubject);     // ?subject_type=&subject_id= → approved + aggregate

// ─── ADMIN (moderation) ─────────────────────────────────────────────────────
router.get('/admin',        verifyToken, c.listAdmin);
router.patch('/admin/:id',  verifyToken, c.moderate);
router.delete('/admin/:id', verifyToken, c.remove);

module.exports = router;
