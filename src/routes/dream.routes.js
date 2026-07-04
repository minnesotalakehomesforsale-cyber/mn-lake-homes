const express = require('express');
const router = express.Router();
const c = require('../controllers/dream.controller');
const { verifyToken } = require('../middleware/auth');

// Admin-only for now — keeps AI (OpenAI) usage off public/agent surfaces.
router.post('/search', verifyToken, c.search);

module.exports = router;
