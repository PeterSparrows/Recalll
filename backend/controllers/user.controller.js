const { User, Material, Quiz, Result, WeakTopic, StudyStreak } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// PATCH /api/users/me  (settings page: department, level, theme, daily goal)
const updateProfile = asyncHandler(async (req, res) => {
  const { full_name, department, level, theme_preference, daily_study_goal_minutes, email_reminders_enabled } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found.');

  if (full_name !== undefined) user.full_name = full_name;
  if (department !== undefined) user.department = department;
  if (level !== undefined) user.level = level;
  if (theme_preference !== undefined) user.theme_preference = theme_preference;
  if (daily_study_goal_minutes !== undefined) user.daily_study_goal_minutes = daily_study_goal_minutes;
  if (email_reminders_enabled !== undefined) user.email_reminders_enabled = email_reminders_enabled;

  await user.save();
  res.status(200).json({ success: true, message: 'Profile updated.', data: { user: user.toSafeJSON() } });
});

// PATCH /api/users/me/password  (change password while logged in — distinct from forgot/reset flow)
const changePassword = asyncHandler(async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { current_password, new_password } = req.body;

  const user = await User.findById(req.user._id).select('+password_hash');
  const isMatch = await user.comparePassword(current_password);
  if (!isMatch) throw new ApiError(401, 'Current password is incorrect.');

  user.password_hash = await bcrypt.hash(new_password, 12);
  user.refresh_token_version += 1; // invalidate other sessions
  await user.save();

  res.status(200).json({ success: true, message: 'Password changed. Please log in again on other devices.' });
});

// GET /api/dashboard/summary
// Powers the dashboard summary cards: Materials Uploaded, Materials
// Analyzed, Total Quizzes, Average Score, Weak Topics, Study Streak.
const getDashboardSummary = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [materialsUploaded, materialsAnalyzed, totalQuizzes, results, weakTopicsCount, streak] = await Promise.all([
    Material.countDocuments({ user: userId }),
    Material.countDocuments({ user: userId, status: 'analyzed' }),
    Quiz.countDocuments({ user: userId }),
    Result.find({ user: userId }).select('percentage'),
    WeakTopic.countDocuments({ user: userId, status: 'weak' }),
    StudyStreak.findOne({ user: userId }),
  ]);

  const averageScore = results.length
    ? Math.round((results.reduce((sum, r) => sum + r.percentage, 0) / results.length) * 10) / 10
    : 0;

  res.status(200).json({
    success: true,
    data: {
      materials_uploaded: materialsUploaded,
      materials_analyzed: materialsAnalyzed,
      total_quizzes: totalQuizzes,
      average_score: averageScore,
      weak_topics: weakTopicsCount,
      study_streak: streak?.current_streak || 0,
    },
  });
});

module.exports = { updateProfile, changePassword, getDashboardSummary };
