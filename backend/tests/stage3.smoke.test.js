/**
 * Stage 3 tests.
 *
 * Part A: route-level smoke tests testable WITHOUT a live MongoDB —
 * auth gating and input validation only (same boundary as Stage 1/2).
 *
 * Part B: real unit tests for the PURE business logic that drives
 * grading, streaks, weak-topic status, and revision scheduling. These
 * need no DB at all and are fully exercised here, not just described.
 */
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

// ---------- Part A: route auth gating / validation ----------

test('POST /api/quizzes without auth returns 401', async () => {
  const res = await request(app).post('/api/quizzes').send({});
  assert.strictEqual(res.status, 401);
});

test('POST /api/quizzes/:quizId/attempts without auth returns 401', async () => {
  const res = await request(app).post('/api/quizzes/64b64c1f2f8fb814c8a1e111/attempts');
  assert.strictEqual(res.status, 401);
});

test('PATCH /api/attempts/:id/answers/:questionId without auth returns 401', async () => {
  const res = await request(app)
    .patch('/api/attempts/64b64c1f2f8fb814c8a1e111/answers/64b64c1f2f8fb814c8a1e112')
    .send({ user_answer: 'x' });
  assert.strictEqual(res.status, 401);
});

test('POST /api/attempts/:id/submit without auth returns 401', async () => {
  const res = await request(app).post('/api/attempts/64b64c1f2f8fb814c8a1e111/submit');
  assert.strictEqual(res.status, 401);
});

test('GET /api/results without auth returns 401', async () => {
  const res = await request(app).get('/api/results');
  assert.strictEqual(res.status, 401);
});

test('GET /api/results/wrong-answers without auth returns 401', async () => {
  const res = await request(app).get('/api/results/wrong-answers');
  assert.strictEqual(res.status, 401);
});

test('GET /api/weak-topics without auth returns 401', async () => {
  const res = await request(app).get('/api/weak-topics');
  assert.strictEqual(res.status, 401);
});

test('GET /api/revisions without auth returns 401', async () => {
  const res = await request(app).get('/api/revisions');
  assert.strictEqual(res.status, 401);
});

test('GET /api/streak without auth returns 401', async () => {
  const res = await request(app).get('/api/streak');
  assert.strictEqual(res.status, 401);
});

test('GET /api/analytics/study-hours without auth returns 401', async () => {
  const res = await request(app).get('/api/analytics/study-hours');
  assert.strictEqual(res.status, 401);
});

test('GET /api/notifications without auth returns 401', async () => {
  const res = await request(app).get('/api/notifications');
  assert.strictEqual(res.status, 401);
});

test('GET /api/dashboard/summary without auth returns 401', async () => {
  const res = await request(app).get('/api/dashboard/summary');
  assert.strictEqual(res.status, 401);
});

test('PATCH /api/users/me without auth returns 401', async () => {
  const res = await request(app).patch('/api/users/me').send({ full_name: 'x' });
  assert.strictEqual(res.status, 401);
});

// ---------- Part B: pure business logic ----------

test('grading: exact-match question types are case/whitespace insensitive', () => {
  const { gradeAnswer } = require('../utils/grading');
  assert.strictEqual(gradeAnswer({ question_type: 'mcq', correct_answer: 'Linked' }, ' linked ').isCorrect, true);
  assert.strictEqual(gradeAnswer({ question_type: 'true_false', correct_answer: 'False' }, 'FALSE').isCorrect, true);
  assert.strictEqual(gradeAnswer({ question_type: 'fill_blank', correct_answer: 'stack' }, 'queue').isCorrect, false);
});

test('grading: unanswered/null counts as wrong, never throws', () => {
  const { gradeAnswer } = require('../utils/grading');
  assert.strictEqual(gradeAnswer({ question_type: 'mcq', correct_answer: 'X' }, '').isCorrect, false);
  assert.strictEqual(gradeAnswer({ question_type: 'mcq', correct_answer: 'X' }, null).isCorrect, false);
  assert.strictEqual(gradeAnswer({ question_type: 'mcq', correct_answer: 'X' }, undefined).isCorrect, false);
});

test('grading: short-answer uses keyword-overlap heuristic with documented threshold', () => {
  const { gradeAnswer } = require('../utils/grading');
  const ref = 'A stack follows the Last In First Out principle';
  const good = gradeAnswer({ question_type: 'short_answer', correct_answer: ref }, 'stacks follow last in first out order');
  const bad = gradeAnswer({ question_type: 'short_answer', correct_answer: ref }, 'bananas are yellow');
  assert.strictEqual(good.isCorrect, true);
  assert.strictEqual(bad.isCorrect, false);
});

test('grading: letter-grade bands match spec thresholds', () => {
  const { gradeFromPercentage } = require('../utils/grading');
  assert.strictEqual(gradeFromPercentage(100), 'A');
  assert.strictEqual(gradeFromPercentage(70), 'A');
  assert.strictEqual(gradeFromPercentage(69.9), 'B');
  assert.strictEqual(gradeFromPercentage(50), 'C');
  assert.strictEqual(gradeFromPercentage(45), 'D');
  assert.strictEqual(gradeFromPercentage(44.9), 'F');
});

test('weakTopic: buildTopicStats aggregates correct/total per topic', () => {
  const { buildTopicStats } = require('../services/weakTopic.service');
  const stats = buildTopicStats([
    { topic: 'Recursion', is_correct: true },
    { topic: 'Recursion', is_correct: false },
    { topic: 'Big O', is_correct: true },
  ]);
  assert.deepStrictEqual(stats, { Recursion: { correct: 1, total: 2 }, 'Big O': { correct: 1, total: 1 } });
});

test('weakTopic: status thresholds match spec (weak<50, strong>=75, else improving)', () => {
  const { statusForAccuracy } = require('../services/weakTopic.service');
  assert.strictEqual(statusForAccuracy(0), 'weak');
  assert.strictEqual(statusForAccuracy(49.9), 'weak');
  assert.strictEqual(statusForAccuracy(50), 'improving');
  assert.strictEqual(statusForAccuracy(74.9), 'improving');
  assert.strictEqual(statusForAccuracy(75), 'strong');
  assert.strictEqual(statusForAccuracy(100), 'strong');
});

test('revision: scheduling plan matches weak/improving/strong policy', () => {
  const { scheduleForStatus } = require('../services/revision.service');
  assert.deepStrictEqual(scheduleForStatus('weak'), { daysAhead: 1, priority: 'high' });
  assert.deepStrictEqual(scheduleForStatus('improving'), { daysAhead: 3, priority: 'medium' });
  assert.strictEqual(scheduleForStatus('strong'), null);
});

test('streak: daysBetween correctly buckets same-day/consecutive/gap', () => {
  const { daysBetween } = require('../services/streak.service');
  const d1 = new Date('2026-08-01T08:00:00Z');
  assert.strictEqual(daysBetween(d1, new Date('2026-08-01T23:00:00Z')), 0);
  assert.strictEqual(daysBetween(d1, new Date('2026-08-02T01:00:00Z')), 1);
  assert.strictEqual(daysBetween(d1, new Date('2026-08-05T01:00:00Z')), 4);
});
