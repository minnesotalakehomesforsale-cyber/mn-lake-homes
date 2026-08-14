const express = require('express');
const router = express.Router();
const diagnostic = require('../controllers/diagnostic.controller');

// GET /api/_diagnostic — system health (T027). Public by default; set
// DIAGNOSTIC_TOKEN to require ?token=... Returns 200 when all-green, 503 otherwise.
router.get('/', diagnostic.health);

module.exports = router;
