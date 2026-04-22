/**
 * business-auth.routes.js — /api/business-auth
 *
 * Signup is public. Everything else requires a logged-in business_owner
 * (the controllers re-check role internally too).
 */

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/business-auth.controller');

router.post('/signup',           c.signup);
router.get ('/me',               verifyToken, c.me);
router.patch('/me',              verifyToken, c.updateMe);
router.post('/checkout',         verifyToken, c.checkout);
router.post('/portal',           verifyToken, c.portal);
router.post('/change-password',  verifyToken, c.changePassword);

module.exports = router;
