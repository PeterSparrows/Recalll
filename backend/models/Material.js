const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    original_filename: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    stored_filename: {
      // randomized name on disk — never derived from user input
      type: String,
      required: true,
      unique: true,
    },
    file_type: {
      type: String,
      required: true,
      enum: ['pdf', 'docx', 'pptx', 'txt'],
    },
    file_size_kb: {
      type: Number,
      required: true,
      min: 0,
    },
    page_count: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'analyzed', 'failed'],
      default: 'uploaded',
    },
    summary: {
      type: String,
      default: null,
    },
    topics_detected: {
      type: [String],
      default: [],
    },
    error_message: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

MaterialSchema.index({ user: 1, course: 1 });
MaterialSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Material', MaterialSchema);
