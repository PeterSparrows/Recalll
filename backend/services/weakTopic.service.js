const { WeakTopic } = require('../models');

const WEAK_THRESHOLD = 50; // accuracy % below this = weak
const STRONG_THRESHOLD = 75; // accuracy % at/above this = strong
// Between the two thresholds = "improving"

function statusForAccuracy(accuracy) {
  if (accuracy < WEAK_THRESHOLD) return 'weak';
  if (accuracy >= STRONG_THRESHOLD) return 'strong';
  return 'improving';
}

/**
 * topicStats: Map<topic, { correct: number, total: number }> for this attempt.
 * Upserts a running WeakTopic record per (user, topic) that accumulates
 * across all attempts, not just this one, so accuracy reflects overall
 * performance on that topic over time.
 */
async function updateWeakTopics(userId, courseId, topicStats) {
  const updated = [];

  for (const [topic, stats] of Object.entries(topicStats)) {
    let record = await WeakTopic.findOne({ user: userId, topic });

    if (!record) {
      record = new WeakTopic({
        user: userId,
        course: courseId || null,
        topic,
        times_tested: 0,
        times_wrong: 0,
        accuracy: 0,
      });
    }

    record.times_tested += stats.total;
    record.times_wrong += stats.total - stats.correct;
    record.accuracy = record.times_tested > 0
      ? Math.round(((record.times_tested - record.times_wrong) / record.times_tested) * 1000) / 10
      : 0;
    record.status = statusForAccuracy(record.accuracy);
    if (courseId) record.course = courseId; // keep most recent course association

    await record.save();
    updated.push(record);
  }

  return updated;
}

/** Returns topic stats built from a list of {topic, is_correct} rows. */
function buildTopicStats(gradedAnswers) {
  const stats = {};
  for (const row of gradedAnswers) {
    const topic = row.topic || 'General';
    if (!stats[topic]) stats[topic] = { correct: 0, total: 0 };
    stats[topic].total += 1;
    if (row.is_correct) stats[topic].correct += 1;
  }
  return stats;
}

module.exports = { updateWeakTopics, buildTopicStats, statusForAccuracy, WEAK_THRESHOLD, STRONG_THRESHOLD };
