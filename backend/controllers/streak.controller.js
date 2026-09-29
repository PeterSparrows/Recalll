const { StudyStreak } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/streak
const getStreak = asyncHandler(async (req, res) => {
  let streak = await StudyStreak.findOne({ user: req.user._id });
  if (!streak) {
    streak = await StudyStreak.create({ user: req.user._id });
  }
  res.status(200).json({ success: true, data: { streak } });
});

module.exports = { getStreak };
