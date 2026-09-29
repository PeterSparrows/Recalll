const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    chunk: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialChunk', default: null },
    question_type: {
      type: String,
      enum: ['mcq', 'true_false', 'fill_blank', 'short_answer'],
      required: true,
    },
    question_text: { type: String, required: true },
    options: {
      // only populated for MCQ
      type: [String],
      default: [],
    },
    correct_answer: { type: String, required: true },
    explanation: { type: String, default: '' },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    topic: { type: String, default: 'General' },
    order_index: { type: Number, required: true },
  },
  { timestamps: true }
);

QuestionSchema.index({ quiz: 1, order_index: 1 });

module.exports = mongoose.model('Question', QuestionSchema);
