const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/register',
  authLimiter,
  [
    body('full_name').trim().isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters.'),
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.')
      .matches(/\d/)
      .withMessage('Password must contain at least one number.'),
    body('department').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('level').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
    body('terms_accepted')
      .isBoolean().withMessage('terms_accepted must be true or false.')
      .bail()
      .equals('true').withMessage('You must accept the Terms and Conditions.'),
  ],
  validate,
  ctrl.register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  validate,
  ctrl.login
);

router.post('/refresh', authLimiter, ctrl.refresh);

router.post('/logout', requireAuth, ctrl.logout);

router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().withMessage('A valid email is required.').normalizeEmail()],
  validate,
  ctrl.forgotPassword
);

router.post(
  '/reset-password',
  authLimiter,
  [
    body('token').notEmpty().withMessage('Reset token is required.'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.')
      .matches(/\d/)
      .withMessage('Password must contain at least one number.'),
  ],
  validate,
  ctrl.resetPassword
);

router.post(
  '/verify-email',
  authLimiter,
  [body('token').notEmpty().withMessage('Verification token is required.')],
  validate,
  ctrl.verifyEmail
);

router.post('/resend-verification', requireAuth, authLimiter, ctrl.resendVerification);

router.get('/me', requireAuth, ctrl.getMe);

module.exports = router;
