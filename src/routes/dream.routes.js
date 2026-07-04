const express = require('express');
const router = express.Router();
const c = require('../controllers/dream.controller');

router.post('/search', c.search);   // natural-language listing search

module.exports = router;
