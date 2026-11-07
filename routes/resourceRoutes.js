const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const c = require('../controllers/resourceController');
const router = express.Router();
router.use(requireAuth, requireRole('user'));
router.get('/resources', c.list);
router.get('/resources/:id', c.detail);
module.exports = router;
