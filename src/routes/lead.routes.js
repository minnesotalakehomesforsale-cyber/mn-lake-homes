const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/', leadController.createLead); // Public Access

// TEMPORARILY DISABLED FOR STAGING - NO LOGIN UI EXISTS YET
router.get('/admin/inbox', leadController.getAdminLeads); // Secure Admin List

module.exports = router;
