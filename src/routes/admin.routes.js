const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const marketingController = require('../controllers/marketing.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── MARKETING (admin "Marketing" tab — posts calendar + mailing list) ──────
// All routes sit before the catch-all /:id agent route at the bottom.
router.get   ('/marketing/overview',                marketingController.overview);
router.get   ('/marketing/newsletter/subscribers',  marketingController.listSubscribers);
router.get   ('/marketing/posts',                   marketingController.listPosts);
router.post  ('/marketing/posts',                   marketingController.createPost);
router.patch ('/marketing/posts/:id',               marketingController.updatePost);
router.delete('/marketing/posts/:id',               marketingController.deletePost);

// ─── ANALYTICS BASELINES (launch-day + future snapshots) ────────────────────
router.get ('/analytics/baselines',   marketingController.listBaselines);
router.post('/analytics/baseline',    marketingController.snapshotBaseline);

// ─── CONVERSION EVENTS (server-side mirror of GA4 / HubSpot) ────────────────
router.get ('/analytics/conversions', marketingController.listConversions);

// ─── SITE IMAGES (admin-editable catalog of every public-page image) ────────
const siteImagesController = require('../controllers/site-images.controller');
router.get   ('/site-images',         siteImagesController.list);
router.post  ('/site-images/upload',  siteImagesController.upload);
router.post  ('/site-images/rescan',  siteImagesController.rescan);
router.patch ('/site-images/:id',     siteImagesController.patch);

// ─── AGENT LEDGER ─────────────────────────────────────────────────────────────
router.get('/', adminController.getLedger);                              // GET /api/admin?search=&status=&membership=&published=
router.post('/', adminController.createAgent);                            // POST /api/admin

// ─── USER MANAGEMENT (must come before /:id to avoid shadowing) ──────────────
router.get('/users', adminController.getUsers);                            // GET /api/admin/users
router.get('/users/:id', adminController.getUserDetail);                   // GET /api/admin/users/:id
router.get('/users/:id/inquiries', adminController.getUserInquiries);      // GET leads + cash-offer leads for this user
router.post ('/users',                  verifyToken, requireRole(['super_admin']), adminController.createAdminUser);     // POST create new admin user (owner-only)
router.patch('/users/:id', adminController.updateUser);                    // PATCH name/email/role
router.patch('/users/:id/permissions',  verifyToken, requireRole(['super_admin']), adminController.setUserPermissions); // PATCH sidebar tab permissions (owner-only)
router.patch('/users/:id/status', adminController.updateUserStatus);       // PATCH account status
router.patch('/users/:id/password', adminController.resetUserPassword);    // PATCH password reset
router.post('/users/:id/hubspot-sync', adminController.syncUserToHubspot); // POST manual HubSpot sync
router.delete('/users/:id', adminController.deleteUser);                   // DELETE user

// ─── ADMIN TABS (canonical list — powers the permission picker) ──────────────
router.get('/admin-tabs', adminController.listAdminTabs);

// ─── TAG LAUNCH PRESETS ─────────────────────────────────────────────────────
// One-shot bulk activate/deactivate on the tags table — used to clean up
// the town directory before launch by keeping only the named top-N cities
// active. Admin-gated.
router.post('/tags/launch-preset',
    verifyToken,
    requireRole(['admin', 'super_admin']),
    adminController.applyTagLaunchPreset
);

// ─── METRICS ─────────────────────────────────────────────────────────────────
router.get('/metrics/agent-coverage', adminController.getAgentCoverage);

// ─── SYSTEM (powers the sidebar System badge — errors/warnings in last 24h) ─
router.get('/system/alerts-count', adminController.getSystemAlertsCount);

// ─── BILLING (live Stripe view for a subscriber: agent | business) ──────────
router.get('/billing/:kind/:id', adminController.getSubscriberBilling);

// ─── MESSAGES (one-way admin → agent in-app messages) ───────────────────────
// Admin-gated. Static prefixes here sit before the catch-all /:id agent route.
const messagesController = require('../controllers/messages.controller');
router.post  ('/messages',               verifyToken, requireRole(['admin', 'super_admin']), messagesController.send);
router.post  ('/messages/broadcast',     verifyToken, requireRole(['admin', 'super_admin']), messagesController.broadcast);
router.get   ('/messages/unread-total',  verifyToken, requireRole(['admin', 'super_admin']), messagesController.unreadTotal);
router.get   ('/messages/threads',       verifyToken, requireRole(['admin', 'super_admin']), messagesController.threads);
router.get   ('/messages/agent/:userId', verifyToken, requireRole(['admin', 'super_admin']), messagesController.threadForAgent);
router.patch ('/messages/:id/read',      verifyToken, requireRole(['admin', 'super_admin']), messagesController.setReadState);
router.delete('/messages/:id',           verifyToken, requireRole(['admin', 'super_admin']), messagesController.remove);

// ─── LEADS (must come before /:id to avoid shadowing) ────────────────────────
router.get('/leads/unassigned-count', adminController.getUnassignedLeadCount);
router.get('/leads/:id', adminController.getLeadDetail);
router.patch('/leads/:id/status', adminController.updateLeadStatus);
router.patch('/leads/:id/assign', adminController.assignLead);
router.post('/leads/:id/notes', adminController.addLeadNote);
router.delete('/leads/:id', adminController.deleteLead);                    // DELETE lead (hard delete)

// ─── AGENT LEADS (must come before /:id to avoid shadowing) ─────────────────
router.get('/:id/leads', adminController.getAgentLeads);

// ─── AGENT NOTES (internal CRM notes, mirrored to HubSpot) ───────────────────
router.get   ('/:id/notes',          verifyToken, requireRole(['admin', 'super_admin']), adminController.getAgentNotes);
router.post  ('/:id/notes',          verifyToken, requireRole(['admin', 'super_admin']), adminController.addAgentNote);
router.delete('/:id/notes/:noteId',  verifyToken, requireRole(['admin', 'super_admin']), adminController.deleteAgentNote);

// ─── AGENT DETAIL (generic /:id last, so specific prefixes match first) ──────
router.get('/:id', adminController.getAgentDetail);                      // GET /api/admin/:id
router.post('/:id/impersonate', verifyToken, requireRole(['admin', 'super_admin']), adminController.impersonateAgent); // POST log in as agent (admin-only)
router.patch('/:id/profile', adminController.updateAgentProfile);        // PATCH /api/admin/:id/profile
router.patch('/:id/status', adminController.updateStatus);               // PATCH /api/admin/:id/status
router.patch('/:id/account-status', adminController.updateAccountStatus);// PATCH /api/admin/:id/account-status
router.delete('/:id', adminController.deleteAgent);                      // DELETE agent (hard delete: profile + account)

module.exports = router;
