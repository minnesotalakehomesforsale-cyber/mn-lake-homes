const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
router.get('/public', agentController.getPublicAgents);
router.get('/faq-questions', agentController.getFaqQuestions);
router.get('/public/:slug', agentController.getAgentBySlug);
// Published featured/related blog posts for an agent's public profile.
router.get('/public/:slug/blog-posts', agentController.listBlogPostsForAgent);

// Agent<->blog links in the "by blog post" direction, for the blog admin
// editor's "Agents featured" picker. Admin-gated in the controller.
router.get('/by-blog-post/:postId', verifyToken, agentController.listAgentsForBlogPost);
router.put('/by-blog-post/:postId', verifyToken, agentController.replaceAgentsForBlogPost);

// Photo upload — returns a URL; caller (agent or admin) PATCHes it via their
// own route to persist against a specific agent record.
router.post('/upload-photo', agentController.uploadPhoto);

// ─── PROTECTED — Agent only ───────────────────────────────────────────────────
router.get('/me', verifyToken, requireRole('agent'), agentController.getMyProfile);
router.get('/me/leads', verifyToken, requireRole('agent'), agentController.getMyLeads);
router.get('/me/roi',   verifyToken, requireRole('agent'), agentController.getMyRoi);
router.get('/me/upgrade-status', verifyToken, requireRole('agent'), agentController.getUpgradeStatus);
router.get('/me/referrals', verifyToken, requireRole('agent'), agentController.getMyReferrals);
router.get('/me/leaderboard', verifyToken, requireRole('agent'), agentController.getMyLeaderboard);
router.get('/admin/at-risk', verifyToken, agentController.getAtRiskAgents);
router.patch('/me/leads/:id/status', verifyToken, requireRole('agent'), agentController.updateMyLeadStatus);
router.patch('/me/leads/:id/outcome', verifyToken, requireRole('agent'), agentController.setMyLeadOutcome);
router.get  ('/me/leads/:id/notes',  verifyToken, requireRole('agent'), agentController.getMyLeadNotes);
router.post ('/me/leads/:id/notes',  verifyToken, requireRole('agent'), agentController.addMyLeadNote);

// ─── In-app messages from admin (read-only on the agent side) ───────────────
const messagesController = require('../controllers/messages.controller');
router.get ('/me/messages',              verifyToken, requireRole('agent'), messagesController.myMessages);
router.post('/me/messages',              verifyToken, requireRole('agent'), messagesController.agentReply);   // two-way: agent → admin
router.get ('/me/messages/unread-count', verifyToken, requireRole('agent'), messagesController.myUnreadCount);
router.post('/me/messages/mark-read',    verifyToken, requireRole('agent'), messagesController.markAllRead);
router.patch('/me', verifyToken, requireRole('agent'), agentController.saveDraft);
router.post('/me/submit', verifyToken, requireRole('agent'), agentController.submitForReview);
// Free agents publish their own profile once required fields are complete.
router.post('/me/publish',   verifyToken, requireRole('agent'), agentController.publishProfile);
router.post('/me/unpublish', verifyToken, requireRole('agent'), agentController.unpublishProfile);
// Self-service account deactivation (reversible; not deletion, not suspension).
router.post('/me/deactivate', verifyToken, requireRole('agent'), agentController.deactivateAccount);
router.post('/me/reactivate', verifyToken, requireRole('agent'), agentController.reactivateAccount);

module.exports = router;
