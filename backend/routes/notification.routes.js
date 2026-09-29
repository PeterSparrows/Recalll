const express = require('express');
const { param, query } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/notification.controller');

// Mounted at /api/notifications
const router = express.Router();
router.use(requireAuth);

router.get('/', [query('unread_only').optional().isIn(['true', 'false'])], validate, ctrl.listNotifications);
router.patch('/read-all', ctrl.markAllNotificationsRead);
router.patch('/:id/read', [param('id').isMongoId()], validate, ctrl.markNotificationRead);
router.post('/generate', ctrl.generateNotifications);

module.exports = router;
