const { StudyStreak } = require('../models');

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b) - startOfDay(a)) / MS_PER_DAY);
}

/**
 * Call this whenever the user does something that counts as "studying"
 * (submitting a quiz attempt, completing a revision session, etc).
 * Idempotent within a single day — calling it twice today only counts once.
 */
async function recordStudyActivity(userId) {
  let streak = await StudyStreak.findOne({ user: userId });
  if (!streak) {
    streak = await StudyStreak.create({ user: userId });
  }

  const today = startOfDay(new Date());

  if (!streak.last_activity_date) {
    streak.current_streak = 1;
    streak.total_study_days = 1;
  } else {
    const diff = daysBetween(streak.last_activity_date, today);
    if (diff === 0) {
      // Already logged today — no change, still return current state.
      return streak;
    } else if (diff === 1) {
      streak.current_streak += 1;
      streak.total_study_days += 1;
    } else {
      // Missed one or more days — streak resets, but total days keeps climbing.
      streak.current_streak = 1;
      streak.total_study_days += 1;
    }
  }

  streak.longest_streak = Math.max(streak.longest_streak, streak.current_streak);
  streak.last_activity_date = today;
  await streak.save();
  return streak;
}

module.exports = { recordStudyActivity, daysBetween, startOfDay };
