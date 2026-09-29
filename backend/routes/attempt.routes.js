const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/attempt.controller');

// mergeParams so this router can be mounted both at /api/attempts and
// nested under /api/quizzes/:quizId/attempts
const router = express.Router({ mergeParams: true });
router.use(requireAuth);

// Nested under /api/quizzes/:quizId/attempts
router.post('/', [param('quizId').isMongoId()], validate, ctrl.startAttempt);
router.post(
  '/:attemptId/retry-wrong',
  [param('quizId').isMongoId(), param('attemptId').isMongoId()],
  validate,
  ctrl.retryWrongOnly
);

module.exports = router;
