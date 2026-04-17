const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activity.controller');

// No auth walls per project convention
router.get('/summary', activityController.getSummary); // must come before '/'
router.get('/',        activityController.getActivity);

module.exports = router;
