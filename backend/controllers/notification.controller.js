const { Notification } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { generateDailyNotifications } = require('../services/notification.service');

// GET /api/notifications
const listNotifications = asyncHandler(async (req, res) => {
  const { unread_only } = req.query;
  const filter = { user: req.user._id };
  if (unread_only === 'true') filter.is_read = false;

  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
  const unreadCount = await Notification.countDocuments({ user: req.user._id, is_read: false });

  res.status(200).json({ success: true, data: { notifications, unread_count: unreadCount } });
});

// PATCH /api/notifications/:id/read
const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { is_read: true },
    { new: true }
  );
  if (!notification) throw new ApiError(404, 'Notification not found.');
  res.status(200).json({ success: true, data: { notification } });
});

// PATCH /api/notifications/read-all
const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, is_read: false }, { is_read: true });
  res.status(200).json({ success: true, message: 'All notifications marked as read.' });
});

// POST /api/notifications/generate
// Manually triggers the daily notification check for the current user.
// In production this same service function is meant to run on a
// schedule (node-cron) for every user — see README "Running background
// jobs". This endpoint exists so the behavior is demoable/testable
// without standing up a cron process.
const generateNotifications = asyncHandler(async (req, res) => {
  const created = await generateDailyNotifications(req.user._id);
  res.status(200).json({ success: true, message: `${created.length} notification(s) generated.`, data: { notifications: created } });
});

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead, generateNotifications };
