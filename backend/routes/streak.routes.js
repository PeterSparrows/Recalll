const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/streak.controller');

// Mounted at /api/streak
const router = express.Router();
router.use(requireAuth);

router.get('/', ctrl.getStreak);

module.exports = router;
