/**
 * marketing.routes.js — PUBLIC marketing endpoints (no auth).
 *
 * Mounted at /api/marketing. Admin marketing endpoints live separately
 * under /api/admin/marketing in admin.routes.js.
 */

const express = require('express');
const router = express.Router();
const marketingController = require('../controllers/marketing.controller');

router.post('/subscribe', marketingController.subscribeNewsletter);

module.exports = router;
