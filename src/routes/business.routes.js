/**
 * business.routes.js — /api/businesses
 *
 * Mount in src/server.js:
 *   app.use('/api/businesses', require('./routes/business.routes'));
 *
 * GETs are public (active-status only for anonymous callers); writes
 * are admin-only, enforced inside the controller.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/business.controller');

function softAuth(req, res, next) {
    let token = req.cookies?.auth_session;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return next();
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch (_) {}
    next();
}

// Public reads
router.get('/',          softAuth, c.list);

// Admin-only upload — sits before /:slugOrId so it isn't swallowed.
router.post('/upload-image', verifyToken, c.uploadImage);

router.get('/:slugOrId', softAuth, c.getOne);

// Admin writes
router.post  ('/',    verifyToken, c.create);
router.patch ('/:id', verifyToken, c.patch);
router.delete('/:id', verifyToken, c.softDelete);

// Business ↔ lake connections (the reverse lookup — admin uses this
// when editing a business and picking which lakes it serves)
router.get('/:id/lakes', softAuth,    c.listLakes);
router.put('/:id/lakes', verifyToken, c.replaceLakes);

module.exports = router;
