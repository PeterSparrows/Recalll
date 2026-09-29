const { Notification, StudyStreak, StudySession, RevisionSchedule } = require('../models');

async function createNotification(userId, type, title, message) {
  return Notification.create({ user: userId, type, title, message, is_read: false });
}

/**
 * Call once per user per day (e.g. from a scheduled job — see README
 * "Running background jobs" for how to wire node-cron in production).
 * Generates the four notification types the spec calls for, avoiding
 * duplicate notifications for the same trigger on the same day.
 */
async function generateDailyNotifications(userId) {
  const notifications = [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  async function alreadyNotifiedToday(type) {
    const existing = await Notification.findOne({ user: userId, type, createdAt: { $gte: todayStart } });
    return !!existing;
  }

  // 1. Daily study goal reminder (if no study session logged yet today)
  const todaysSession = await StudySession.findOne({ user: userId, session_date: { $gte: todayStart } });
  if (!todaysSession && !(await alreadyNotifiedToday('daily_goal'))) {
    notifications.push(
      await createNotification(
        userId,
        'daily_goal',
        "Today's study goal is waiting",
        "You haven't logged any study time today. A short session now keeps your streak alive."
      )
    );
  }

  // 2. Revision sessions due today
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dueToday = await RevisionSchedule.find({
    user: userId,
    status: { $in: ['pending', 'overdue'] },
    scheduled_date: { $gte: todayStart, $lt: tomorrowStart },
  });
  if (dueToday.length > 0 && !(await alreadyNotifiedToday('revision_due'))) {
    const topics = dueToday.map((r) => r.topic).join(', ');
    notifications.push(
      await createNotification(
        userId,
        'revision_due',
        `${dueToday.length} revision session${dueToday.length > 1 ? 's' : ''} due today`,
        `Scheduled topics: ${topics}`
      )
    );
  }

  // 3. Inactivity reminder (no activity in N days, default 3)
  const INACTIVITY_DAYS = 3;
  const streak = await StudyStreak.findOne({ user: userId });
  if (streak?.last_activity_date) {
    const daysSince = Math.floor((Date.now() - new Date(streak.last_activity_date).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= INACTIVITY_DAYS && !(await alreadyNotifiedToday('inactivity'))) {
      notifications.push(
        await createNotification(
          userId,
          'inactivity',
          "You've been away for a while",
          `It's been ${daysSince} days since your last study session. Jump back in with a quick revision.`
        )
      );
    }
  }

  // 4. Upcoming revision sessions (next 2 days, not yet due today)
  const twoDaysOut = new Date(todayStart);
  twoDaysOut.setDate(twoDaysOut.getDate() + 3);
  const upcoming = await RevisionSchedule.find({
    user: userId,
    status: 'pending',
    scheduled_date: { $gte: tomorrowStart, $lt: twoDaysOut },
  });
  if (upcoming.length > 0 && !(await alreadyNotifiedToday('upcoming_revision'))) {
    const topics = upcoming.map((r) => r.topic).join(', ');
    notifications.push(
      await createNotification(
        userId,
        'upcoming_revision',
        `${upcoming.length} revision session${upcoming.length > 1 ? 's' : ''} coming up`,
        `Scheduled soon: ${topics}`
      )
    );
  }

  return notifications;
}

module.exports = { createNotification, generateDailyNotifications };
