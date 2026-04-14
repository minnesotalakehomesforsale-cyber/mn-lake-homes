const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// Public
router.get('/public', agentController.getPublicAgents);
router.get('/public/:slug', agentController.getAgentBySlug);

// Protected (Agent Operations)
router.get('/me', verifyToken, requireRole('agent'), agentController.getMyProfile);
router.patch('/me', verifyToken, requireRole('agent'), agentController.updateMyProfile);

module.exports = router;
