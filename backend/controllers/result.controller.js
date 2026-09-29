const { Result, Answer, Question, MaterialChunk, Attempt } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/results/:attemptId
// Full breakdown for the results page: per-question correct/wrong,
// explanations, and topic performance.
const getResultForAttempt = asyncHandler(async (req, res) => {
  const result = await Result.findOne({ attempt: req.params.attemptId, user: req.user._id });
  if (!result) throw new ApiError(404, 'Result not found for this attempt.');

  const answers = await Answer.find({ attempt: req.params.attemptId });
  const questions = await Question.find({ _id: { $in: answers.map((a) => a.question) } });
  const questionById = new Map(questions.map((q) => [q._id.toString(), q]));

  const breakdown = answers.map((a) => {
    const q = questionById.get(a.question.toString());
    return {
      question_id: a.question,
      question_text: q?.question_text,
      question_type: q?.question_type,
      topic: q?.topic,
      user_answer: a.user_answer,
      correct_answer: q?.correct_answer,
      is_correct: a.is_correct,
      explanation: q?.explanation,
    };
  });

  res.status(200).json({ success: true, data: { result, breakdown } });
});

// GET /api/results  (quiz history, paginated)
const listResults = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);

  const [results, total] = await Promise.all([
    Result.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('quiz', 'title'),
    Result.countDocuments({ user: req.user._id }),
  ]);

  res.status(200).json({
    success: true,
    data: { results, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
});

// GET /api/results/wrong-answers  (permanent wrong-answer review section)
const listWrongAnswers = asyncHandler(async (req, res) => {
  // Scope to this user's own attempts FIRST, rather than pulling every
  // wrong answer in the system and filtering afterward.
  const userAttemptIds = await Attempt.find({ user: req.user._id }).distinct('_id');

  const wrongAnswers = await Answer.find({ is_correct: false, attempt: { $in: userAttemptIds } })
    .populate('question')
    .sort({ answered_at: -1 });

  // Batch-fetch all referenced chunks in one query instead of N+1.
  const chunkIds = wrongAnswers.map((a) => a.question?.chunk).filter(Boolean);
  const chunks = await MaterialChunk.find({ _id: { $in: chunkIds } }).select('content page_number');
  const chunkById = new Map(chunks.map((c) => [c._id.toString(), c]));

  const rows = wrongAnswers.map((a) => {
    const sourceChunk = a.question?.chunk ? chunkById.get(a.question.chunk.toString()) : null;
    return {
      answer_id: a._id,
      attempt_id: a.attempt,
      question_id: a.question?._id,
      question_text: a.question?.question_text,
      topic: a.question?.topic,
      user_answer: a.user_answer,
      correct_answer: a.question?.correct_answer,
      explanation: a.question?.explanation,
      source_material_reference: sourceChunk
        ? { page_number: sourceChunk.page_number, excerpt: sourceChunk.content.slice(0, 200) }
        : null,
      answered_at: a.answered_at,
    };
  });

  res.status(200).json({ success: true, data: { wrong_answers: rows } });
});

module.exports = { getResultForAttempt, listResults, listWrongAnswers };
