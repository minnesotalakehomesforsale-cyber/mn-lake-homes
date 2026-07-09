const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inquiry.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// Admin-only guard for reading/managing submitted inquiries (customer PII).
const adminOnly = [verifyToken, requireRole(['admin', 'super_admin'])];

// ─── Public — submit an inquiry / job application (contact + careers forms) ──
router.post('/', ctrl.createInquiry);
router.post('/upload-resume', ctrl.uploadResume);

// ─── Admin — read/manage inquiries. Previously OPEN (leaked customer PII);
//     now behind admin auth. The public POST routes above stay open. ─────────
router.get('/',              ...adminOnly, ctrl.getInquiries);
router.get('/unread-count',  ...adminOnly, ctrl.getUnreadCount);
router.patch('/:id',         ...adminOnly, ctrl.updateInquiry);
router.delete('/:id',        ...adminOnly, ctrl.deleteInquiry);

module.exports = router;
