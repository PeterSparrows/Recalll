const mongoose = require('mongoose');

const ResultSchema = new mongoose.Schema(
  {
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    score: { type: Number, required: true, min: 0 },
    total_questions: { type: Number, required: true, min: 1 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    grade: { type: String, required: true }, // e.g. 'A', 'B', 'C', 'D', 'F'
    correct_count: { type: Number, required: true, min: 0 },
    wrong_count: { type: Number, required: true, min: 0 },
    topic_breakdown: {
      // { [topic]: { correct: number, total: number, accuracy: number } }
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

ResultSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Result', ResultSchema);
