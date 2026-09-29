const { RevisionSchedule } = require('../models');

/**
 * Spacing rule (simplified spaced-repetition, not full SM-2 — that's
 * reserved for the flashcard-style "Recall" style app; here it's a
 * lighter revision-nudge scheduler):
 * - weak topics (accuracy < 50%)     -> revise in 1 day,  priority high
 * - improving topics (50–74%)        -> revise in 3 days, priority medium
 * - strong topics                    -> no auto-schedule
 */
function scheduleForStatus(status) {
  switch (status) {
    case 'weak':
      return { daysAhead: 1, priority: 'high' };
    case 'improving':
      return { daysAhead: 3, priority: 'medium' };
    default:
      return null;
  }
}

/**
 * weakTopicRecords: array of WeakTopic documents (already saved) from
 * this attempt's grading pass. Creates or refreshes one pending
 * RevisionSchedule entry per topic that needs it — avoids piling up
 * duplicate pending entries for the same topic.
 */
async function scheduleRevisionsForWeakTopics(userId, materialId, weakTopicRecords) {
  const created = [];

  for (const record of weakTopicRecords) {
    const plan = scheduleForStatus(record.status);
    if (!plan) continue; // strong topics don't need scheduling

    const existing = await RevisionSchedule.findOne({
      user: userId,
      topic: record.topic,
      status: 'pending',
    });

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + plan.daysAhead);
    scheduledDate.setHours(9, 0, 0, 0); // default to a 9am nudge

    if (existing) {
      // Refresh the schedule/priority rather than creating a duplicate
      existing.scheduled_date = scheduledDate;
      existing.priority = plan.priority;
      existing.course = record.course || existing.course;
      existing.material = materialId || existing.material;
      await existing.save();
      created.push(existing);
    } else {
      const entry = await RevisionSchedule.create({
        user: userId,
        topic: record.topic,
        course: record.course || null,
        material: materialId || null,
        scheduled_date: scheduledDate,
        status: 'pending',
        priority: plan.priority,
      });
      created.push(entry);
    }
  }

  return created;
}

/** Marks any pending entries whose scheduled_date has passed as 'overdue'. */
async function markOverdueRevisions(userId) {
  const now = new Date();
  await RevisionSchedule.updateMany(
    { user: userId, status: 'pending', scheduled_date: { $lt: now } },
    { $set: { status: 'overdue' } }
  );
}

module.exports = { scheduleRevisionsForWeakTopics, scheduleForStatus, markOverdueRevisions };
