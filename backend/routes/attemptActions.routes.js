const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/attempt.controller');

// Mounted at /api/attempts
const router = express.Router();
router.use(requireAuth);

router.get('/:id', [param('id').isMongoId()], validate, ctrl.getAttempt);

router.patch(
  '/:id/answers/:questionId',
  [
    param('id').isMongoId(),
    param('questionId').isMongoId(),
    body('user_answer').optional({ checkFalsy: false }).isString().isLength({ max: 5000 }),
    body('time_spent_seconds').optional().isInt({ min: 0 }).toInt(),
  ],
  validate,
  ctrl.saveAnswer
);

router.post('/:id/submit', [param('id').isMongoId()], validate, ctrl.submitAttempt);

module.exports = router;
