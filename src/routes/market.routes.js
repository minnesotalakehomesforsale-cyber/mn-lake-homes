const express = require('express');
const router = express.Router();
const c = require('../controllers/market.controller');

router.get('/index', c.getIndex);   // public MN Lake Market Index

module.exports = router;
