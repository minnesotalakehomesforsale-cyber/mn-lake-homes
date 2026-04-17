const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripe.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// Authenticated — agent creates a checkout session
router.post('/checkout', verifyToken, requireRole('agent'), stripeController.createCheckoutSession);

// Public — Stripe calls this directly (no auth, raw body parsed upstream)
router.post('/webhook', stripeController.handleWebhook);

module.exports = router;
