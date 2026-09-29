const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/user.controller');

// Mounted at /api/dashboard
const router = express.Router();
router.use(requireAuth);

router.get('/summary', ctrl.getDashboardSummary);

module.exports = router;
