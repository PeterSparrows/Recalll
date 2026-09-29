const mongoose = require('mongoose');

const StudySessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    activity_type: {
      type: String,
      enum: ['quiz', 'upload_review', 'revision', 'reading'],
      required: true,
    },
    duration_minutes: { type: Number, required: true, min: 0 },
    session_date: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

StudySessionSchema.index({ user: 1, session_date: 1 });

module.exports = mongoose.model('StudySession', StudySessionSchema);
