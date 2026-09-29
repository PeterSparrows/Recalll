const express = require('express');
const { query } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/analytics.controller');

// Mounted at /api/analytics
const router = express.Router();
router.use(requireAuth);

router.get('/study-hours', [query('days').optional().isInt({ min: 1, max: 90 })], validate, ctrl.getStudyHours);
router.get('/scores-over-time', [query('limit').optional().isInt({ min: 1, max: 100 })], validate, ctrl.getScoresOverTime);
router.get('/accuracy-trends', ctrl.getAccuracyTrends);
router.get('/topic-strength', ctrl.getTopicStrength);
router.get('/streak-history', [query('days').optional().isInt({ min: 1, max: 365 })], validate, ctrl.getStreakHistory);
router.get('/revision-completion', ctrl.getRevisionCompletionRate);

module.exports = router;
