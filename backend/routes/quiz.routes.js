const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/quiz.controller');

const router = express.Router();
router.use(requireAuth);

router.post(
  '/',
  [
    body('material_id').isMongoId().withMessage('A valid material_id is required.'),
    body('course_id').optional({ checkFalsy: true }).isMongoId(),
    body('title').optional({ checkFalsy: true }).isLength({ max: 150 }),
    body('source_scope').isIn(['full_document', 'chapter', 'pages', 'topics']),
    body('scope_detail').optional().isObject(),
    body('question_types').isArray({ min: 1 }),
    body('question_types.*').isIn(['mcq', 'true_false', 'fill_blank', 'short_answer']),
    body('difficulty').optional().isIn(['easy', 'medium', 'hard', 'mixed']),
    body('total_questions').isInt({ min: 1, max: 100 }).toInt(),
    body('time_limit_minutes').optional({ checkFalsy: true }).isInt({ min: 1 }).toInt(),
  ],
  validate,
  ctrl.createQuiz
);

router.get(
  '/',
  [
    query('course_id').optional().isMongoId(),
    query('material_id').optional().isMongoId(),
    query('status').optional().isIn(['generating', 'ready', 'failed']),
  ],
  validate,
  ctrl.listQuizzes
);

router.get('/:id', [param('id').isMongoId()], validate, ctrl.getQuiz);
router.get('/:id/questions', [param('id').isMongoId()], validate, ctrl.getQuizQuestionsForAssessment);

module.exports = router;
