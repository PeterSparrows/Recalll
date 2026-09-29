/**
 * Pure grading functions — no DB, no side effects, easy to unit test.
 *
 * Grading rules:
 * - mcq / true_false / fill_blank: exact match against correct_answer,
 *   case-insensitive and whitespace-trimmed.
 * - short_answer: NOT reliably auto-gradable without a real NLP model.
 *   We use a heuristic keyword-overlap score against the reference
 *   sentence and flag it as correct only above a generous threshold.
 *   This is documented as a heuristic in the README — a real deployment
 *   would want manual grading or a semantic-similarity model for these.
 */

const SHORT_ANSWER_OVERLAP_THRESHOLD = 0.35;

function normalize(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenize(str) {
  return normalize(str)
    .replace(/[^\w\s]/g, '')
    .split(' ')
    .filter((w) => w.length > 2); // drop very short/stop-ish tokens
}

function gradeExactMatch(userAnswer, correctAnswer) {
  return normalize(userAnswer) === normalize(correctAnswer);
}

function gradeShortAnswer(userAnswer, referenceAnswer) {
  const userTokens = new Set(tokenize(userAnswer));
  const refTokens = new Set(tokenize(referenceAnswer));
  if (refTokens.size === 0) return { isCorrect: false, overlapRatio: 0 };

  let overlap = 0;
  for (const t of refTokens) {
    if (userTokens.has(t)) overlap += 1;
  }
  const overlapRatio = overlap / refTokens.size;
  return { isCorrect: overlapRatio >= SHORT_ANSWER_OVERLAP_THRESHOLD, overlapRatio };
}

/**
 * Grades a single answer against its question. Returns { isCorrect: boolean }.
 * `question` needs: question_type, correct_answer.
 */
function gradeAnswer(question, userAnswer) {
  if (userAnswer == null || userAnswer === '') {
    return { isCorrect: false }; // unanswered/skipped counts as wrong
  }

  switch (question.question_type) {
    case 'mcq':
    case 'true_false':
    case 'fill_blank':
      return { isCorrect: gradeExactMatch(userAnswer, question.correct_answer) };
    case 'short_answer': {
      const { isCorrect, overlapRatio } = gradeShortAnswer(userAnswer, question.correct_answer);
      return { isCorrect, overlapRatio };
    }
    default:
      return { isCorrect: false };
  }
}

/**
 * Computes a letter grade from a percentage. Thresholds are a
 * standard 5-band scale; easy to change in one place.
 */
function gradeFromPercentage(percentage) {
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 45) return 'D';
  return 'F';
}

module.exports = { gradeAnswer, gradeFromPercentage, normalize, tokenize };
