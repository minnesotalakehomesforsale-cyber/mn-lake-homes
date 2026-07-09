const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activity.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// Admin-only activity audit log. Previously OPEN to the internet; now walled.
const adminOnly = [verifyToken, requireRole(['admin', 'super_admin'])];

router.get('/summary', ...adminOnly, activityController.getSummary); // before '/'
router.get('/',        ...adminOnly, activityController.getActivity);

module.exports = router;
