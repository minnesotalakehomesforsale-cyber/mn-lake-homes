const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripe.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// Public — display-only pricing config (env-driven labels). Used by
// pages/public/pricing.html. No secrets exposed.
router.get('/pricing', stripeController.getAgentPricing);

// Authenticated agent endpoints
router.post('/checkout', verifyToken, requireRole('agent'), stripeController.createCheckoutSession);
router.post('/portal',   verifyToken, requireRole('agent'), stripeController.createPortalSession);
router.get ('/billing',  verifyToken, requireRole('agent'), stripeController.getMyBilling);

// Public — Stripe calls this directly (no auth, raw body parsed upstream)
router.post('/webhook', stripeController.handleWebhook);

module.exports = router;
