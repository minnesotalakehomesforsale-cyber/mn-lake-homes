const express = require('express');
const router = express.Router();
const c = require('../controllers/partner.controller');
const { verifyToken } = require('../middleware/auth');

// Public
router.get('/', c.listPublic);            // ?category= → active partners
router.post('/refer', c.refer);           // buyer requests a service

// Admin
router.get   ('/admin',           verifyToken, c.listAdmin);
router.post  ('/admin',           verifyToken, c.saveAdmin);       // create/update
router.delete('/admin/:id',       verifyToken, c.removeAdmin);
router.get   ('/admin/referrals', verifyToken, c.referralsAdmin);

module.exports = router;
