const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema(
  {
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true },
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    user_answer: { type: String, default: '' }, // '' means unanswered / skipped
    is_correct: { type: Boolean, default: null }, // null until graded
    time_spent_seconds: { type: Number, default: 0 },
    answered_at: { type: Date, default: null },
  },
  { timestamps: true }
);

AnswerSchema.index({ attempt: 1, question: 1 }, { unique: true });

module.exports = mongoose.model('Answer', AnswerSchema);
