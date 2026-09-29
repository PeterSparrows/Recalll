/**
 * Daily reminder job.
 *
 * Runs once a day (schedule set in server.js via node-cron). For every
 * user who hasn't logged any study activity yet today, sends a reminder
 * email nudging them back — mentioning their current streak if they
 * have one, since that's the strongest nudge to not break it.
 *
 * This does NOT touch the in-app Notification records (that's handled
 * separately by notification.service.js's generateDailyNotifications,
 * which the /api/notifications/generate endpoint triggers) — this job
 * is specifically about actual emails going out on a schedule.
 */
const { User, StudyStreak, StudySession } = require('../models');
const { sendDailyReminderEmail } = require('../services/email.service');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function runDailyReminderJob() {
  const todayStart = startOfToday();
  console.log(`[daily-reminder] Running at ${new Date().toISOString()}`);

  const users = await User.find({ email_reminders_enabled: { $ne: false } }).select(
    '_id full_name email daily_study_goal_minutes'
  );

  let sentCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    try {
      const todaysSession = await StudySession.findOne({
        user: user._id,
        session_date: { $gte: todayStart },
      });
      if (todaysSession) {
        skippedCount++;
        continue;
      }

      const streak = await StudyStreak.findOne({ user: user._id });

      await sendDailyReminderEmail(user.email, user.full_name, {
        streak: streak?.current_streak || 0,
        goalMinutes: user.daily_study_goal_minutes || 30,
      });
      sentCount++;
    } catch (err) {
      console.error(`[daily-reminder] Failed for user ${user._id}:`, err.message);
    }
  }

  console.log(`[daily-reminder] Done. Sent: ${sentCount}, skipped (already studied today): ${skippedCount}`);
}

module.exports = { runDailyReminderJob };