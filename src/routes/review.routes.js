const express = require('express');
const router = express.Router();
const c = require('../controllers/review.controller');
const { verifyToken } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rate-limit');

const reviewLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 6, bucket: 'reviews', message: 'Too many review submissions — please try again later.' });

// ─── PUBLIC ───────────────────────────────────────────────────────────────
router.post('/', reviewLimit, c.submit);            // submit a review (lands 'pending')
router.get('/', c.listForSubject);     // ?subject_type=&subject_id= → approved + aggregate
router.get ('/request/:token', c.getRequest);       // verified-review link details
router.post('/request/:token', reviewLimit, c.submitVerified);   // submit a verified review

// ─── ADMIN (moderation) ─────────────────────────────────────────────────────
router.get('/admin',        verifyToken, c.listAdmin);
router.patch('/admin/:id',  verifyToken, c.moderate);
router.delete('/admin/:id', verifyToken, c.remove);

module.exports = router;
