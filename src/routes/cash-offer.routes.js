/**
 * cash-offer.routes.js — Public routes for the AI Cash Offer funnel.
 *
 * Mounted in server.js:
 *   app.use('/api/cash-offer', require('./routes/cash-offer.routes'));
 *
 * All endpoints are public (no auth) because the funnel runs for anonymous
 * visitors before they ever provide contact info.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cash-offer.controller');

router.post('/lookup',              ctrl.lookup);
router.post('/generate',            ctrl.generate);
router.post('/submit',              ctrl.submit);
router.post('/:leadId/selection',   ctrl.selection);
router.get('/:leadId/pdf',          ctrl.pdf);

module.exports = router;
