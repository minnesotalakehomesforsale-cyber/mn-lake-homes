const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');
const { attachUserIfPresent, verifyToken } = require('../middleware/auth');

router.post('/', attachUserIfPresent, leadController.createLead); // Public; user_id linked by email

router.get('/mine', verifyToken, leadController.getMyLeads);      // Signed-in user's own submissions

router.get('/admin/inbox', leadController.getAdminLeads);

module.exports = router;
