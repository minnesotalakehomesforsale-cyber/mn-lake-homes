const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inquiry.controller');

// Public
router.post('/', ctrl.createInquiry);
router.post('/upload-resume', ctrl.uploadResume);

// Admin (no auth wall — covered by admin-guard.js on the page)
router.get('/',              ctrl.getInquiries);
router.get('/unread-count',  ctrl.getUnreadCount);
router.patch('/:id',         ctrl.updateInquiry);
router.delete('/:id',        ctrl.deleteInquiry);

module.exports = router;
