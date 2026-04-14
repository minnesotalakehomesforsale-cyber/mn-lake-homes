const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireRole('super_admin')); // Admin only bounds

router.get('/', adminController.getLedger);
router.get('/:id', adminController.getAgentDetail);
router.patch('/:id/status', adminController.updateStatus);

// LEAD OPERATIONS
router.get('/leads/:id', adminController.getLeadDetail);
router.patch('/leads/:id/status', adminController.updateLeadStatus);
router.patch('/leads/:id/assign', adminController.assignLead);
router.post('/leads/:id/notes', adminController.addLeadNote);

module.exports = router;
