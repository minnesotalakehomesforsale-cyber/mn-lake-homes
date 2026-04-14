const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/', leadController.createLead); // Public Access

router.get('/admin/inbox', verifyToken, requireRole('super_admin'), leadController.getAdminLeads); // Secure Admin List

module.exports = router;
