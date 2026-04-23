const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

// ─── AGENT LEDGER ─────────────────────────────────────────────────────────────
router.get('/', adminController.getLedger);                              // GET /api/admin?search=&status=&membership=&published=
router.post('/', adminController.createAgent);                            // POST /api/admin

// ─── USER MANAGEMENT (must come before /:id to avoid shadowing) ──────────────
router.get('/users', adminController.getUsers);                            // GET /api/admin/users
router.get('/users/:id', adminController.getUserDetail);                   // GET /api/admin/users/:id
router.patch('/users/:id', adminController.updateUser);                    // PATCH name/email/role
router.patch('/users/:id/status', adminController.updateUserStatus);       // PATCH account status
router.patch('/users/:id/password', adminController.resetUserPassword);    // PATCH password reset
router.delete('/users/:id', adminController.deleteUser);                   // DELETE user

// ─── METRICS ─────────────────────────────────────────────────────────────────
router.get('/metrics/agent-coverage', adminController.getAgentCoverage);

// ─── LEADS (must come before /:id to avoid shadowing) ────────────────────────
router.get('/leads/unassigned-count', adminController.getUnassignedLeadCount);
router.get('/leads/:id', adminController.getLeadDetail);
router.patch('/leads/:id/status', adminController.updateLeadStatus);
router.patch('/leads/:id/assign', adminController.assignLead);
router.post('/leads/:id/notes', adminController.addLeadNote);

// ─── AGENT LEADS (must come before /:id to avoid shadowing) ─────────────────
router.get('/:id/leads', adminController.getAgentLeads);

// ─── AGENT DETAIL (generic /:id last, so specific prefixes match first) ──────
router.get('/:id', adminController.getAgentDetail);                      // GET /api/admin/:id
router.patch('/:id/profile', adminController.updateAgentProfile);        // PATCH /api/admin/:id/profile
router.patch('/:id/status', adminController.updateStatus);               // PATCH /api/admin/:id/status
router.patch('/:id/account-status', adminController.updateAccountStatus);// PATCH /api/admin/:id/account-status

module.exports = router;
