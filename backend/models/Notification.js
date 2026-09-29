const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['daily_goal', 'revision_due', 'inactivity', 'upcoming_revision', 'system'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 150 },
    message: { type: String, required: true, maxlength: 500 },
    is_read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, is_read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
