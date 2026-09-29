const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/course.controller');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/',
  [
    body('code').trim().notEmpty().withMessage('Course code is required.').isLength({ max: 20 }),
    body('title').trim().notEmpty().withMessage('Course title is required.').isLength({ max: 150 }),
    body('description').optional({ checkFalsy: true }).isLength({ max: 1000 }),
  ],
  validate,
  ctrl.createCourse
);

router.get(
  '/',
  [query('status').optional().isIn(['active', 'archived'])],
  validate,
  ctrl.listCourses
);

router.get('/:id', [param('id').isMongoId()], validate, ctrl.getCourse);

router.patch(
  '/:id',
  [
    param('id').isMongoId(),
    body('title').optional().trim().isLength({ min: 1, max: 150 }),
    body('code').optional().trim().isLength({ min: 1, max: 20 }),
    body('description').optional({ checkFalsy: true }).isLength({ max: 1000 }),
  ],
  validate,
  ctrl.updateCourse
);

router.patch('/:id/archive', [param('id').isMongoId()], validate, ctrl.archiveCourse);
router.patch('/:id/unarchive', [param('id').isMongoId()], validate, ctrl.unarchiveCourse);
router.delete('/:id', [param('id').isMongoId()], validate, ctrl.deleteCourse);

module.exports = router;
