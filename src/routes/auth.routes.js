const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/waitlist', authController.waitlist);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/session', verifyToken, authController.session);

module.exports = router;
