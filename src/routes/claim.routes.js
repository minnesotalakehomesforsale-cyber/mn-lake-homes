const express = require('express');
const router = express.Router();
const claim = require('../controllers/claim.controller');
const { rateLimit } = require('../middleware/rate-limit');

// DEV-10 self-claim. Start is rate-limited (abuse surface); verify is a one-time
// token link. Free tier — no payment anywhere in this flow.
router.post('/start',  rateLimit({ windowMs: 10 * 60 * 1000, max: 5, bucket: 'claim-start', message: 'Too many attempts — try again in a few minutes.' }), claim.start);
router.get ('/verify', claim.verify);

module.exports = router;
