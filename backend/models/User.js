const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    },
    password_hash: {
      type: String,
      required: true,
      select: false, // never returned by default queries
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    level: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
    },
    profile_picture: {
      type: String, // stored (randomized) filename, not the original
      default: null,
    },
    theme_preference: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },
    daily_study_goal_minutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 720,
    },
    terms_accepted_at: {
      type: Date,
      required: true,
    },
    email_reminders_enabled: {
      type: Boolean,
      default: true,
    },
    reset_token: {
      type: String,
      select: false,
      default: null,
    },
    reset_token_expires: {
      type: Date,
      select: false,
      default: null,
    },
    email_verified: {
      type: Boolean,
      default: false,
    },
    verification_token: {
      type: String,
      select: false,
      default: null,
    },
    verification_token_expires: {
      type: Date,
      select: false,
      default: null,
    },
    refresh_token_version: {
      // bumped on logout/password-reset to invalidate old refresh tokens
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Instance method: compare plaintext password against stored hash
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

// Never leak password_hash / reset token fields even if select() is overridden
UserSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.password_hash;
  delete obj.reset_token;
  delete obj.reset_token_expires;
  delete obj.verification_token;
  delete obj.verification_token_expires;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
