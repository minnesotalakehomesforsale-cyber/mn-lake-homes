const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
router.get('/public', agentController.getPublicAgents);
router.get('/public/:slug', agentController.getAgentBySlug);

// ─── PROTECTED — Agent only ───────────────────────────────────────────────────
router.get('/me', verifyToken, requireRole('agent'), agentController.getMyProfile);
router.get('/me/leads', verifyToken, requireRole('agent'), agentController.getMyLeads);
router.patch('/me', verifyToken, requireRole('agent'), agentController.saveDraft);
router.post('/me/submit', verifyToken, requireRole('agent'), agentController.submitForReview);

module.exports = router;
