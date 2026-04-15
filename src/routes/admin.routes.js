const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// All admin routes require a valid session with admin or super_admin role
router.use(verifyToken);
router.use(requireRole(['admin', 'super_admin']));

// ─── AGENT LEDGER ─────────────────────────────────────────────────────────────
router.get('/', adminController.getLedger);                              // GET /api/admin?search=&status=&membership=&published=
router.post('/', adminController.createAgent);                           // POST /api/admin

// ─── USER MANAGEMENT (must come before /:id to avoid shadowing) ──────────────
router.get('/users', adminController.getUsers);                          // GET /api/admin/users
router.get('/users/:id', adminController.getUserDetail);                 // GET /api/admin/users/:id

// ─── LEADS (must come before /:id to avoid shadowing) ────────────────────────
router.get('/leads/:id', adminController.getLeadDetail);
router.patch('/leads/:id/status', adminController.updateLeadStatus);
router.patch('/leads/:id/assign', adminController.assignLead);
router.post('/leads/:id/notes', adminController.addLeadNote);

// ─── AGENT DETAIL (generic /:id last, so specific prefixes match first) ──────
router.get('/:id', adminController.getAgentDetail);                      // GET /api/admin/:id
router.patch('/:id/profile', adminController.updateAgentProfile);        // PATCH /api/admin/:id/profile
router.patch('/:id/status', adminController.updateStatus);               // PATCH /api/admin/:id/status
router.patch('/:id/account-status', adminController.updateAccountStatus);// PATCH /api/admin/:id/account-status

module.exports = router;
