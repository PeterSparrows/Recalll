const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    code: {
      type: String,
      required: [true, 'Course code is required'],
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    title: {
      type: String,
      required: [true, 'Course title is required'],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
  },
  { timestamps: true }
);

// A user cannot have two courses with the same code
CourseSchema.index({ user: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Course', CourseSchema);
