const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');
const { attachUserIfPresent, verifyToken } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rate-limit');
const { leadSpamGuard } = require('../middleware/spam-guard');

// Public lead submit, hardened so agents only get real leads: IP rate limit
// (8 / 10 min) → spam guard (honeypot + timing + optional Turnstile) → create.
router.post('/',
    rateLimit({ windowMs: 10 * 60 * 1000, max: 8, bucket: 'leads', message: 'You\'ve submitted a few times already — please wait a few minutes.' }),
    leadSpamGuard,
    attachUserIfPresent,
    leadController.createLead); // Public; user_id linked by email

router.get('/mine', verifyToken, leadController.getMyLeads);      // Signed-in user's own submissions

router.get('/admin/inbox', leadController.getAdminLeads);

module.exports = router;
