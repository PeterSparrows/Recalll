const express = require('express');
const { param, query } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/result.controller');

// Mounted at /api/results
const router = express.Router();
router.use(requireAuth);

// IMPORTANT: specific routes before the /:attemptId param route,
// otherwise "wrong-answers" would be parsed as an attempt id.
router.get('/wrong-answers', ctrl.listWrongAnswers);
router.get('/', [query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 50 })], validate, ctrl.listResults);
router.get('/:attemptId', [param('attemptId').isMongoId()], validate, ctrl.getResultForAttempt);

module.exports = router;
