/**
 * admin-cash-offer-partner.routes.js — Admin-only CRUD for the
 * cash-offer partner network.
 *
 * Mounted in server.js:
 *   app.use('/api/admin/cash-offer-partners',
 *           require('./routes/admin-cash-offer-partner.routes'));
 */

const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/admin-cash-offer-partner.controller');

const adminOnly = [verifyToken, requireRole(['admin', 'super_admin'])];

router.get('/',         ...adminOnly, ctrl.list);
router.post('/',        ...adminOnly, ctrl.create);
router.patch('/:id',    ...adminOnly, ctrl.patch);
router.delete('/:id',   ...adminOnly, ctrl.remove);

module.exports = router;
