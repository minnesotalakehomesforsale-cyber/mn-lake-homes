const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assistant.controller');

router.post('/chat',            ctrl.chat);
router.get('/history',          ctrl.getHistory);
router.delete('/history',       ctrl.clearHistory);

module.exports = router;
