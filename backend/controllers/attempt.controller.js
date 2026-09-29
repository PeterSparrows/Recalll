const { Attempt, Answer, Question, Quiz, Result, StudySession } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { gradeAnswer, gradeFromPercentage } = require('../utils/grading');
const { buildTopicStats, updateWeakTopics } = require('../services/weakTopic.service');
const { scheduleRevisionsForWeakTopics } = require('../services/revision.service');
const { recordStudyActivity } = require('../services/streak.service');

// POST /api/quizzes/:quizId/attempts
const startAttempt = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.quizId, user: req.user._id });
  if (!quiz) throw new ApiError(404, 'Quiz not found.');
  if (quiz.status !== 'ready') throw new ApiError(422, `Quiz is not ready (status: ${quiz.status}).`);

  const attempt = await Attempt.create({
    quiz: quiz._id,
    user: req.user._id,
    started_at: new Date(),
    status: 'in_progress',
  });

  res.status(201).json({ success: true, message: 'Attempt started.', data: { attempt } });
});

// POST /api/quizzes/:quizId/attempts/:attemptId/retry-wrong
// Creates a fresh attempt scoped to only the questions the user got
// wrong on a prior attempt (per spec: "allow retrying only the
// previously-wrong questions"). We track the allowed question set via
// the new attempt's parent_attempt + is_retry_of_wrong_only fields and
// enforce it when answers are saved/submitted.
const retryWrongOnly = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.quizId, user: req.user._id });
  if (!quiz) throw new ApiError(404, 'Quiz not found.');

  const parentAttempt = await Attempt.findOne({ _id: req.params.attemptId, user: req.user._id, quiz: quiz._id });
  if (!parentAttempt) throw new ApiError(404, 'Original attempt not found.');
  if (parentAttempt.status !== 'submitted') throw new ApiError(422, 'Original attempt has not been submitted yet.');

  const wrongAnswers = await Answer.find({ attempt: parentAttempt._id, is_correct: false });
  if (wrongAnswers.length === 0) {
    throw new ApiError(422, 'No wrong answers to retry — that attempt was a clean sweep.');
  }

  const retryAttempt = await Attempt.create({
    quiz: quiz._id,
    user: req.user._id,
    is_retry_of_wrong_only: true,
    parent_attempt: parentAttempt._id,
    started_at: new Date(),
    status: 'in_progress',
  });

  const allowedQuestionIds = wrongAnswers.map((a) => a.question);

  res.status(201).json({
    success: true,
    message: 'Retry attempt started for previously-wrong questions.',
    data: { attempt: retryAttempt, allowed_question_ids: allowedQuestionIds },
  });
});

// PATCH /api/attempts/:id/answers/:questionId  (autosave, called repeatedly while taking the quiz)
const saveAnswer = asyncHandler(async (req, res) => {
  const { user_answer, time_spent_seconds } = req.body;

  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.user._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found.');
  if (attempt.status !== 'in_progress') throw new ApiError(422, 'This attempt is no longer in progress.');

  const question = await Question.findOne({ _id: req.params.questionId, quiz: attempt.quiz });
  if (!question) throw new ApiError(404, 'Question not found for this quiz.');

  if (attempt.is_retry_of_wrong_only) {
    const wasWrong = await Answer.findOne({
      attempt: attempt.parent_attempt,
      question: question._id,
      is_correct: false,
    });
    if (!wasWrong) {
      throw new ApiError(403, 'This question was not part of the wrong-answer retry set.');
    }
  }

  const answer = await Answer.findOneAndUpdate(
    { attempt: attempt._id, question: question._id },
    {
      user_answer: user_answer ?? '',
      time_spent_seconds: time_spent_seconds || 0,
      answered_at: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, message: 'Answer saved.', data: { answer } });
});

// GET /api/attempts/:id  (resume / review)
const getAttempt = asyncHandler(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.user._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found.');

  const answers = await Answer.find({ attempt: attempt._id });
  res.status(200).json({ success: true, data: { attempt, answers } });
});

// POST /api/attempts/:id/submit
const submitAttempt = asyncHandler(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.user._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found.');
  if (attempt.status !== 'in_progress') throw new ApiError(422, 'This attempt has already been submitted.');

  const quiz = await Quiz.findById(attempt.quiz);
  if (!quiz) throw new ApiError(404, 'Parent quiz no longer exists.');

  // Only questions that were actually saved via saveAnswer are graded —
  // this is what makes retry-wrong-only naturally score just that subset.
  const answers = await Answer.find({ attempt: attempt._id });
  const questionIds = answers.map((a) => a.question);
  const questions = await Question.find({ _id: { $in: questionIds } });
  const questionById = new Map(questions.map((q) => [q._id.toString(), q]));

  let correctCount = 0;
  const gradedRows = [];

  for (const answer of answers) {
    const question = questionById.get(answer.question.toString());
    if (!question) continue;

    const { isCorrect } = gradeAnswer(question, answer.user_answer);
    answer.is_correct = isCorrect;
    await answer.save();

    if (isCorrect) correctCount += 1;
    gradedRows.push({ topic: question.topic, is_correct: isCorrect });
  }

  const totalQuestions = gradedRows.length;
  const wrongCount = totalQuestions - correctCount;
  const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;
  const grade = gradeFromPercentage(percentage);

  const topicStats = buildTopicStats(gradedRows);
  const topicBreakdown = {};
  for (const [topic, stats] of Object.entries(topicStats)) {
    topicBreakdown[topic] = {
      correct: stats.correct,
      total: stats.total,
      accuracy: Math.round((stats.correct / stats.total) * 1000) / 10,
    };
  }

  attempt.status = 'submitted';
  attempt.submitted_at = new Date();
  attempt.time_taken_seconds = Math.round((attempt.submitted_at - attempt.started_at) / 1000);
  await attempt.save();

  const result = await Result.create({
    attempt: attempt._id,
    user: req.user._id,
    quiz: quiz._id,
    score: correctCount,
    total_questions: totalQuestions,
    percentage,
    grade,
    correct_count: correctCount,
    wrong_count: wrongCount,
    topic_breakdown: topicBreakdown,
  });

  // Side effects: weak-topic detection, revision scheduling, streak, study session.
  const weakTopicRecords = await updateWeakTopics(req.user._id, quiz.course, topicStats);
  await scheduleRevisionsForWeakTopics(req.user._id, quiz.material, weakTopicRecords);
  await recordStudyActivity(req.user._id);
  await StudySession.create({
    user: req.user._id,
    activity_type: 'quiz',
    duration_minutes: Math.max(1, Math.round(attempt.time_taken_seconds / 60)),
    session_date: new Date(),
  });

  res.status(200).json({
    success: true,
    message: 'Attempt submitted and graded.',
    data: { result, weak_topics: weakTopicRecords },
  });
});

module.exports = { startAttempt, retryWrongOnly, saveAnswer, getAttempt, submitAttempt };
