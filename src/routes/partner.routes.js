// Partner Perks — admin CRUD. Mounted at /api/admin/partner-perks.
// All routes admin-gated (per-route, matching the cash-offer routers).
const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/partner.controller');

const adminOnly = [verifyToken, requireRole(['admin', 'super_admin'])];

// Tiers (must precede /:id so 'tiers' isn't read as a company id)
router.get   ('/tiers', ...adminOnly, ctrl.getTiers);

// Companies
router.get   ('/',    ...adminOnly, ctrl.listCompanies);
router.post  ('/',    ...adminOnly, ctrl.createCompany);
router.get   ('/:id', ...adminOnly, ctrl.getCompany);
router.patch ('/:id', ...adminOnly, ctrl.updateCompany);
router.delete('/:id', ...adminOnly, ctrl.deleteCompany);

// Offers
router.post  ('/:id/offers',           ...adminOnly, ctrl.createOffer);
router.patch ('/:id/offers/:offerId',  ...adminOnly, ctrl.updateOffer);
router.delete('/:id/offers/:offerId',  ...adminOnly, ctrl.deleteOffer);

// Contacts
router.post  ('/:id/contacts',             ...adminOnly, ctrl.addContact);
router.delete('/:id/contacts/:contactId',  ...adminOnly, ctrl.deleteContact);

// Notes
router.post  ('/:id/notes',          ...adminOnly, ctrl.addNote);
router.delete('/:id/notes/:noteId',  ...adminOnly, ctrl.deleteNote);

// Files (contracts) — multipart upload
router.post  ('/:id/files',           ...adminOnly, ctrl.fileUpload.single('file'), ctrl.uploadFile);
router.delete('/:id/files/:fileId',   ...adminOnly, ctrl.deleteFile);

module.exports = router;
