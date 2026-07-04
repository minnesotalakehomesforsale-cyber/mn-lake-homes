const express = require('express');
const router = express.Router();
const c = require('../controllers/cockpit.controller');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, c.getCockpit);

module.exports = router;
