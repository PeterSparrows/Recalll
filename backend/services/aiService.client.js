const ApiError = require('../utils/ApiError');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS) || 60000;

async function callAiService(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(504, 'AI service timed out. Please try again.');
    }
    throw new ApiError(502, 'Could not reach the AI service. Is it running?');
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status >= 400 && res.status < 500 ? 422 : 502, data.detail || 'AI service request failed.');
  }

  return data;
}

/**
 * Runs the full document pipeline: extract -> clean -> chunk -> embed
 * -> FAISS index -> topics -> summary.
 */
async function processDocument({ filePath, fileType, materialId }) {
  return callAiService('/process-document', {
    file_path: filePath,
    file_type: fileType,
    material_id: materialId,
  });
}

async function generateQuestions({ chunkTexts, topicLabels, questionTypes, totalQuestions }) {
  return callAiService('/generate-questions', {
    chunk_texts: chunkTexts,
    topic_labels: topicLabels,
    question_types: questionTypes,
    total_questions: totalQuestions,
  });
}

async function searchMaterial({ vectorStorePath, queryText, topK = 5 }) {
  return callAiService('/search', {
    vector_store_path: vectorStorePath,
    query_text: queryText,
    top_k: topK,
  });
}

module.exports = { processDocument, generateQuestions, searchMaterial };
