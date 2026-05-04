const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');
const { attachUserIfPresent } = require('../middleware/auth');

router.post('/', attachUserIfPresent, leadController.createLead); // Public; user_id captured if logged in

router.get('/admin/inbox', leadController.getAdminLeads);

module.exports = router;
