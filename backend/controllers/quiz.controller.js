const { Quiz, Question } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { generateQuizFromMaterial } = require('../services/quizGeneration.service');

// POST /api/quizzes
const createQuiz = asyncHandler(async (req, res) => {
  const {
    material_id,
    course_id,
    title,
    source_scope,
    scope_detail,
    question_types,
    difficulty,
    total_questions,
    time_limit_minutes,
  } = req.body;

  const quiz = await generateQuizFromMaterial({
    userId: req.user._id,
    materialId: material_id,
    courseId: course_id,
    title,
    sourceScope: source_scope,
    scopeDetail: scope_detail,
    questionTypes: question_types,
    difficulty,
    totalQuestions: total_questions,
    timeLimitMinutes: time_limit_minutes,
  });

  res.status(201).json({ success: true, message: 'Quiz generated.', data: { quiz } });
});

// GET /api/quizzes
const listQuizzes = asyncHandler(async (req, res) => {
  const { course_id, material_id, status } = req.query;
  const filter = { user: req.user._id };
  if (course_id) filter.course = course_id;
  if (material_id) filter.material = material_id;
  if (status) filter.status = status;

  const quizzes = await Quiz.find(filter).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: { quizzes } });
});

// GET /api/quizzes/:id
const getQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id });
  if (!quiz) throw new ApiError(404, 'Quiz not found.');
  res.status(200).json({ success: true, data: { quiz } });
});

// GET /api/quizzes/:id/questions
// Used by the assessment page while taking the quiz — strips
// correct_answer/explanation so the client never receives answers
// before submitting.
const getQuizQuestionsForAssessment = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id });
  if (!quiz) throw new ApiError(404, 'Quiz not found.');
  if (quiz.status !== 'ready') throw new ApiError(422, `Quiz is not ready (status: ${quiz.status}).`);

  const questions = await Question.find({ quiz: quiz._id })
    .select('-correct_answer -explanation')
    .sort({ order_index: 1 });

  res.status(200).json({ success: true, data: { quiz, questions } });
});

module.exports = { createQuiz, listQuizzes, getQuiz, getQuizQuestionsForAssessment };
