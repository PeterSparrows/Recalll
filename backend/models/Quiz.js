const mongoose = require('mongoose');

const QuizSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    source_scope: {
      type: String,
      enum: ['full_document', 'chapter', 'pages', 'topics'],
      required: true,
    },
    scope_detail: {
      // e.g. { chapter: 'Chapter 3' } or { pages: [1,2,3] } or { topics: ['Recursion'] }
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    question_types: {
      type: [String],
      enum: ['mcq', 'true_false', 'fill_blank', 'short_answer'],
      default: ['mcq'],
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'mixed'],
      default: 'mixed',
    },
    time_limit_minutes: { type: Number, default: null },
    total_questions: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['generating', 'ready', 'failed'],
      default: 'generating',
    },
  },
  { timestamps: true }
);

QuizSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Quiz', QuizSchema);
