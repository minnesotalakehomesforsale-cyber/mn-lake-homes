/**
 * admin-cash-offer.routes.js — Admin-only routes for cash-offer management.
 *
 * Mounted in server.js:
 *   app.use('/api/admin/cash-offers', require('./routes/admin-cash-offer.routes'));
 *
 * All endpoints require a valid JWT and an admin role.
 */

const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/admin-cash-offer.controller');

const adminOnly = [verifyToken, requireRole(['admin', 'super_admin'])];

router.get('/new-count',  ...adminOnly, ctrl.newCount);
router.get('/',           ...adminOnly, ctrl.list);
router.get('/:id',        ...adminOnly, ctrl.detail);
router.patch('/:id',      ...adminOnly, ctrl.patch);

module.exports = router;
