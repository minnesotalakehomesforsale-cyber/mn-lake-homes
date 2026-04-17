const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
router.get('/public', agentController.getPublicAgents);
router.get('/public/:slug', agentController.getAgentBySlug);

// Photo upload — returns a URL; caller (agent or admin) PATCHes it via their
// own route to persist against a specific agent record.
router.post('/upload-photo', agentController.uploadPhoto);

// ─── PROTECTED — Agent only ───────────────────────────────────────────────────
router.get('/me', verifyToken, requireRole('agent'), agentController.getMyProfile);
router.get('/me/leads', verifyToken, requireRole('agent'), agentController.getMyLeads);
router.patch('/me', verifyToken, requireRole('agent'), agentController.saveDraft);
router.post('/me/submit', verifyToken, requireRole('agent'), agentController.submitForReview);

module.exports = router;
