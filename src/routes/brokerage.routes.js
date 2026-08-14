/**
 * brokerage.routes.js — /api/brokerages
 *
 * Mount in src/server.js:
 *   app.use('/api/brokerages', require('./routes/brokerage.routes'));
 *
 * Only a public GET list (powers the agent-profile + join-form combobox).
 * New brokerages are added server-side on save via reconcileBrokerage(),
 * not through a public write endpoint.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/brokerage.controller');

router.get('/', c.list);

module.exports = router;
