const express = require('express');
const router = express.Router();
const c = require('../controllers/search.controller');
const { verifyToken } = require('../middleware/auth');

// Saved searches / price alerts — all scoped to the signed-in user.
router.get   ('/mine', verifyToken, c.listMine);
router.post  ('/',     verifyToken, c.createSearch);
router.delete('/:id',  verifyToken, c.removeSearch);

module.exports = router;
