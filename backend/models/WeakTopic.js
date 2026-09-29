const mongoose = require('mongoose');

const WeakTopicSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    topic: { type: String, required: true, trim: true },
    accuracy: { type: Number, required: true, min: 0, max: 100 },
    times_tested: { type: Number, default: 0 },
    times_wrong: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['weak', 'improving', 'strong'],
      default: 'weak',
    },
  },
  { timestamps: true }
);

WeakTopicSchema.index({ user: 1, topic: 1 }, { unique: true });

module.exports = mongoose.model('WeakTopic', WeakTopicSchema);
