const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/waitlist', authController.waitlist);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/session', verifyToken, authController.session);
router.get('/me', verifyToken, authController.me);
router.patch('/profile', verifyToken, authController.updateProfile);
router.post('/password', verifyToken, authController.changePassword);

// Password reset (public, anti-enumeration). Forgot accepts {email} and
// always returns the same generic body. Reset accepts {token, new_password}.
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);

module.exports = router;
