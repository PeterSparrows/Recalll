const mongoose = require('mongoose');

const RevisionScheduleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    topic: { type: String, required: true, trim: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null },
    scheduled_date: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'skipped', 'overdue'],
      default: 'pending',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
  },
  { timestamps: true }
);

RevisionScheduleSchema.index({ user: 1, scheduled_date: 1 });
RevisionScheduleSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('RevisionSchedule', RevisionScheduleSchema);
