const { StudySession, Result, WeakTopic, RevisionSchedule, StudyStreak } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/analytics/study-hours?days=7
// Weekly study hours: total minutes studied per day, last N days.
const getStudyHours = asyncHandler(async (req, res) => {
  const days = Math.min(90, parseInt(req.query.days) || 7);
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const sessions = await StudySession.aggregate([
    { $match: { user: req.user._id, session_date: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$session_date' } },
        total_minutes: { $sum: '$duration_minutes' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json({ success: true, data: { study_hours: sessions } });
});

// GET /api/analytics/scores-over-time
const getScoresOverTime = asyncHandler(async (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit) || 30);
  const results = await Result.find({ user: req.user._id })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select('percentage grade createdAt quiz')
    .populate('quiz', 'title');

  res.status(200).json({ success: true, data: { scores: results } });
});

// GET /api/analytics/accuracy-trends
// Rolling accuracy per topic over successive attempts (uses WeakTopic's
// running accuracy, which already accumulates across attempts).
const getAccuracyTrends = asyncHandler(async (req, res) => {
  const topics = await WeakTopic.find({ user: req.user._id }).sort({ accuracy: 1 });
  res.status(200).json({
    success: true,
    data: {
      accuracy_trends: topics.map((t) => ({
        topic: t.topic,
        accuracy: t.accuracy,
        times_tested: t.times_tested,
        status: t.status,
      })),
    },
  });
});

// GET /api/analytics/topic-strength
const getTopicStrength = asyncHandler(async (req, res) => {
  const topics = await WeakTopic.find({ user: req.user._id });
  const grouped = { weak: [], improving: [], strong: [] };
  for (const t of topics) {
    grouped[t.status]?.push({ topic: t.topic, accuracy: t.accuracy });
  }
  res.status(200).json({ success: true, data: { topic_strength: grouped } });
});

// GET /api/analytics/streak-history?days=90
// Returns the current snapshot PLUS a day-by-day activity calendar
// (derived from StudySession dates) so the frontend can actually plot
// a streak history chart, not just show current/longest numbers.
const getStreakHistory = asyncHandler(async (req, res) => {
  const days = Math.min(365, parseInt(req.query.days) || 90);
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const [streak, activeDays] = await Promise.all([
    StudyStreak.findOne({ user: req.user._id }),
    StudySession.aggregate([
      { $match: { user: req.user._id, session_date: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$session_date' } } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    data: {
      streak_history: streak || { current_streak: 0, longest_streak: 0, total_study_days: 0, last_activity_date: null },
      active_days: activeDays.map((d) => d._id), // ["2026-07-30", "2026-07-31", ...] — one entry per day with any study activity
    },
  });
});

// GET /api/analytics/revision-completion
const getRevisionCompletionRate = asyncHandler(async (req, res) => {
  const counts = await RevisionSchedule.aggregate([
    { $match: { user: req.user._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const completed = byStatus.completed || 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

  res.status(200).json({
    success: true,
    data: { revision_completion: { by_status: byStatus, total, completion_rate_percent: completionRate } },
  });
});

module.exports = {
  getStudyHours,
  getScoresOverTime,
  getAccuracyTrends,
  getTopicStrength,
  getStreakHistory,
  getRevisionCompletionRate,
};
