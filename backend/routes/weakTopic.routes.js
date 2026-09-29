const express = require('express');
const { query } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/weakTopic.controller');

// Mounted at /api/weak-topics
const router = express.Router();
router.use(requireAuth);

router.get('/', [query('status').optional().isIn(['weak', 'improving', 'strong'])], validate, ctrl.listWeakTopics);

module.exports = router;
