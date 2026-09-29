const mongoose = require('mongoose');

const StudyStreakSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    current_streak: { type: Number, default: 0 },
    longest_streak: { type: Number, default: 0 },
    last_activity_date: { type: Date, default: null },
    total_study_days: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudyStreak', StudyStreakSchema);
