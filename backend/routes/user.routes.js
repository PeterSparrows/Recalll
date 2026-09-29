const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/user.controller');

// Mounted at /api/users
const router = express.Router();
router.use(requireAuth);

router.patch(
  '/me',
  [
    body('full_name').optional().trim().isLength({ min: 2, max: 100 }),
    body('department').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('level').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
    body('theme_preference').optional().isIn(['light', 'dark']),
    body('daily_study_goal_minutes').optional().isInt({ min: 5, max: 720 }).toInt(),
    body('email_reminders_enabled').optional().isBoolean().withMessage('email_reminders_enabled must be true or false.'),
  ],
  validate,
  ctrl.updateProfile
);

router.patch(
  '/me/password',
  [
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 8 }).matches(/\d/).withMessage('New password must be at least 8 characters and contain a number.'),
  ],
  validate,
  ctrl.changePassword
);

module.exports = router;
