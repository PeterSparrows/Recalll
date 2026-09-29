const mongoose = require('mongoose');

const AttemptSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    is_retry_of_wrong_only: { type: Boolean, default: false },
    parent_attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', default: null }, // set if this is a wrong-only retry
    started_at: { type: Date, required: true, default: Date.now },
    submitted_at: { type: Date, default: null },
    time_taken_seconds: { type: Number, default: null },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'abandoned'],
      default: 'in_progress',
    },
  },
  { timestamps: true }
);

AttemptSchema.index({ user: 1, quiz: 1 });
AttemptSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Attempt', AttemptSchema);
