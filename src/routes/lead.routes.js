const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');

router.post('/', leadController.createLead); // Public Access

router.get('/admin/inbox', leadController.getAdminLeads);

module.exports = router;
