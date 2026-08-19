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

// ─── PROTECTED — Agent only ───────────────────────────────────────────────────

// Photo upload — returns a URL; caller (agent or admin) PATCHes it via their
// own route to persist against a specific agent record. Auth required so the
// endpoint can't be used as an open image host on our Cloudinary account.
router.post('/upload-photo', verifyToken, requireRole(['agent', 'admin', 'super_admin']), agentController.uploadPhoto);
router.get('/me', verifyToken, requireRole('agent'), agentController.getMyProfile);
router.get('/me/leads', verifyToken, requireRole('agent'), agentController.getMyLeads);
// Partner Perks — tier-gated offer feed for the signed-in agent.
router.get('/me/perks', verifyToken, requireRole('agent'), require('../controllers/partner.controller').agentPerks);
router.get('/me/roi',   verifyToken, requireRole('agent'), agentController.getMyRoi);
router.get('/me/reach', verifyToken, requireRole('agent'), agentController.getMyReach);
router.get('/me/search-terms', verifyToken, requireRole('agent'), agentController.getMySearchTerms);

// Agent's own contacts — the "light CRM" (portal #12/#13/#16).
const contactsController = require('../controllers/contacts.controller');
router.get   ('/me/contacts',            verifyToken, requireRole('agent'), contactsController.list);
router.post  ('/me/contacts',            verifyToken, requireRole('agent'), contactsController.create);
router.post  ('/me/contacts/import',     verifyToken, requireRole('agent'), contactsController.importCsv);
router.patch ('/me/contacts/:id',        verifyToken, requireRole('agent'), contactsController.update);
router.delete('/me/contacts/:id',        verifyToken, requireRole('agent'), contactsController.remove);
router.get   ('/me/contacts/:id/notes',  verifyToken, requireRole('agent'), contactsController.listNotes);
router.post  ('/me/contacts/:id/notes',  verifyToken, requireRole('agent'), contactsController.addNote);

// In-app notification centre (portal #11).
const notificationsController = require('../controllers/notifications.controller');
router.get ('/me/notifications',              verifyToken, requireRole('agent'), notificationsController.list);
router.get ('/me/notifications/unread-count', verifyToken, requireRole('agent'), notificationsController.unreadCount);
router.post('/me/notifications/mark-read',    verifyToken, requireRole('agent'), notificationsController.markRead);
router.get('/me/upgrade-status', verifyToken, requireRole('agent'), agentController.getUpgradeStatus);
router.get('/me/referrals', verifyToken, requireRole('agent'), agentController.getMyReferrals);
router.get('/me/leaderboard', verifyToken, requireRole('agent'), agentController.getMyLeaderboard);
router.get('/admin/at-risk', verifyToken, requireRole(['admin', 'super_admin']), agentController.getAtRiskAgents);
router.patch('/me/leads/:id/status', verifyToken, requireRole('agent'), agentController.updateMyLeadStatus);
router.patch('/me/leads/:id/followup', verifyToken, requireRole('agent'), agentController.setMyLeadFollowUp);
router.patch('/me/pause', verifyToken, requireRole('agent'), agentController.setMyPause);
router.patch('/me/leads/:id/outcome', verifyToken, requireRole('agent'), agentController.setMyLeadOutcome);
router.patch('/me/leads/:id/disposition', verifyToken, requireRole('agent'), agentController.setMyLeadDisposition);
router.post ('/me/leads/:id/dispute',     verifyToken, requireRole('agent'), agentController.disputeMyLead);
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
