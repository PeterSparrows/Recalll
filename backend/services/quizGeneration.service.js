const { Quiz, Question, MaterialChunk, Material } = require('../models');
const ApiError = require('../utils/ApiError');
const aiClient = require('./aiService.client');

/**
 * Resolves which chunks feed the quiz, based on source_scope:
 * - full_document: every chunk of the material
 * - pages: chunks whose page_number is in scope_detail.pages
 * - topics: chunks whose topic_label matches one of scope_detail.topics
 *     (falls back to the material's whole chunk set if no chunk carries
 *     a matching topic_label, since topic_label is a best-effort field)
 * - chapter: NOTE — materials have no explicit chapter/heading field in
 *     this pipeline (chunking is page/sentence based, not structure-
 *     aware). We approximate "chapter" by treating scope_detail.chapter
 *     as a topic-label match, same as the topics scope. This is a real
 *     limitation, documented here and in the README, not silently
 *     hidden — a true chapter-aware split would need heading detection
 *     added to the AI service's chunking step.
 */
async function resolveChunksForScope(material, sourceScope, scopeDetail) {
  const allChunks = await MaterialChunk.find({ material: material._id }).sort({ chunk_index: 1 });

  if (allChunks.length === 0) {
    throw new ApiError(422, 'This material has no processed content yet. Wait for analysis to finish.');
  }

  switch (sourceScope) {
    case 'full_document':
      return allChunks;

    case 'pages': {
      const pages = (scopeDetail?.pages || []).map(Number);
      if (pages.length === 0) throw new ApiError(400, 'scope_detail.pages must be a non-empty array of page numbers.');
      const filtered = allChunks.filter((c) => pages.includes(c.page_number));
      if (filtered.length === 0) throw new ApiError(422, 'No content found for the requested pages.');
      return filtered;
    }

    case 'topics': {
      const topics = (scopeDetail?.topics || []).map((t) => String(t).toLowerCase());
      if (topics.length === 0) throw new ApiError(400, 'scope_detail.topics must be a non-empty array.');
      const filtered = allChunks.filter((c) => c.topic_label && topics.includes(c.topic_label.toLowerCase()));
      return filtered.length > 0 ? filtered : allChunks; // best-effort fallback, see note above
    }

    case 'chapter': {
      const chapter = String(scopeDetail?.chapter || '').toLowerCase();
      if (!chapter) throw new ApiError(400, 'scope_detail.chapter is required for chapter scope.');
      const filtered = allChunks.filter((c) => c.topic_label && c.topic_label.toLowerCase().includes(chapter));
      return filtered.length > 0 ? filtered : allChunks; // best-effort fallback, see note above
    }

    default:
      throw new ApiError(400, `Unknown source_scope: ${sourceScope}`);
  }
}

async function generateQuizFromMaterial({
  userId,
  materialId,
  courseId,
  title,
  sourceScope,
  scopeDetail,
  questionTypes,
  difficulty,
  totalQuestions,
  timeLimitMinutes,
}) {
  const material = await Material.findOne({ _id: materialId, user: userId });
  if (!material) throw new ApiError(404, 'Material not found.');
  if (material.status !== 'analyzed') {
    throw new ApiError(422, `Material is not ready for quiz generation (status: ${material.status}).`);
  }

  const chunks = await resolveChunksForScope(material, sourceScope, scopeDetail);
  const chunkTexts = chunks.map((c) => c.content);

  const quiz = await Quiz.create({
    user: userId,
    material: materialId,
    course: courseId || material.course || null,
    title: title || `${material.original_filename} — Quiz`,
    source_scope: sourceScope,
    scope_detail: scopeDetail || {},
    question_types: questionTypes,
    difficulty,
    time_limit_minutes: timeLimitMinutes || null,
    total_questions: totalQuestions,
    status: 'generating',
  });

  try {
    const aiResponse = await aiClient.generateQuestions({
      chunkTexts,
      topicLabels: material.topics_detected.length ? material.topics_detected : null,
      questionTypes,
      totalQuestions,
    });

    if (!aiResponse.questions || aiResponse.questions.length === 0) {
      quiz.status = 'failed';
      await quiz.save();
      throw new ApiError(422, 'Could not generate any questions from this material/scope. Try a broader scope.');
    }

    // Map each generated question back to the chunk it was likely drawn
    // from (best-effort: exact substring match), so Question.chunk can
    // be a real reference for "source material" links in wrong-answer
    // review, without requiring the AI service to track this itself.
    const questionDocs = aiResponse.questions.map((q, i) => {
      const sourceChunk = chunks.find((c) => c.content.includes(q.correct_answer)) || null;
      return {
        quiz: quiz._id,
        chunk: sourceChunk ? sourceChunk._id : null,
        question_type: q.question_type,
        question_text: q.question_text,
        options: q.options || [],
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        topic: q.topic || 'General',
        order_index: i,
      };
    });

    await Question.insertMany(questionDocs);

    quiz.status = 'ready';
    quiz.total_questions = questionDocs.length; // may be fewer than requested if material is short
    await quiz.save();

    return quiz;
  } catch (err) {
    quiz.status = 'failed';
    await quiz.save().catch(() => {});
    throw err;
  }
}

module.exports = { generateQuizFromMaterial, resolveChunksForScope };
