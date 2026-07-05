const express = require('express');
const router = express.Router();
const c = require('../controllers/valuation.controller');
const { rateLimit } = require('../middleware/rate-limit');

// Public instant home-value estimate. Rate-limited to stop abuse/scraping.
router.post('/estimate',
    rateLimit({ windowMs: 10 * 60 * 1000, max: 30, bucket: 'valuation' }),
    c.estimate);

module.exports = router;
