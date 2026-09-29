"""
Question generation service.

HONEST NOTE: The spec's stretch goal is FLAN-T5-small generating
questions. That model's weights come from the HuggingFace Hub, which
this environment can't reach, so this module implements rule-based /
heuristic question generation instead — built from real NLP signal
(TF-IDF keyword importance, sentence structure) rather than random
templating. It's honest, explainable, and defensible in a project
demo, but it is NOT a neural model. Swap-in instructions for FLAN-T5
are in README.md.
"""
import random
import re
from dataclasses import dataclass, field
from typing import List, Optional
from sklearn.feature_extraction.text import TfidfVectorizer

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")
_WORD = re.compile(r"[A-Za-z][A-Za-z\-']{2,}")


@dataclass
class GeneratedQuestion:
    question_type: str
    question_text: str
    options: List[str] = field(default_factory=list)
    correct_answer: str = ""
    explanation: str = ""
    difficulty: str = "medium"
    topic: str = "General"


def _sentences(text: str) -> List[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if len(s.strip()) > 25]


def _keyword_terms(chunk_texts: List[str], top_n: int = 40) -> List[str]:
    if not chunk_texts:
        return []
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 1), min_df=1)
    matrix = vectorizer.fit_transform(chunk_texts)
    terms = vectorizer.get_feature_names_out()
    scores = matrix.sum(axis=0).A1
    ranked = sorted(zip(terms, scores), key=lambda x: -x[1])
    return [t for t, _ in ranked[:top_n] if len(t) > 3]


def _difficulty_for_sentence(sentence: str) -> str:
    words = sentence.split()
    if len(words) < 12:
        return "easy"
    if len(words) < 22:
        return "medium"
    return "hard"


def _make_fill_blank(sentence: str, keywords: List[str]) -> Optional[GeneratedQuestion]:
    words_in_sentence = set(w.lower() for w in _WORD.findall(sentence))
    candidates = [k for k in keywords if k.lower() in words_in_sentence]
    if not candidates:
        return None

    target = candidates[0]
    pattern = re.compile(rf"\b{re.escape(target)}\b", re.IGNORECASE)
    match = pattern.search(sentence)
    if not match:
        return None

    blanked = pattern.sub("_____", sentence, count=1)
    return GeneratedQuestion(
        question_type="fill_blank",
        question_text=blanked,
        correct_answer=match.group(0),
        explanation=f'The missing term is "{match.group(0)}", drawn directly from the source material.',
        difficulty=_difficulty_for_sentence(sentence),
    )


def _make_true_false(sentence: str, make_false: bool) -> Optional[GeneratedQuestion]:
    if not make_false:
        return GeneratedQuestion(
            question_type="true_false",
            question_text=sentence,
            correct_answer="True",
            explanation="This statement appears verbatim in the source material.",
            difficulty=_difficulty_for_sentence(sentence),
        )

    negations = [
        (r"\bis\b", "is not"),
        (r"\bare\b", "are not"),
        (r"\bcan\b", "cannot"),
        (r"\bdoes\b", "does not"),
        (r"\ballows\b", "does not allow"),
        (r"\brequires\b", "does not require"),
        (r"\bfollows\b", "does not follow"),
    ]
    for pattern, replacement in negations:
        if re.search(pattern, sentence, re.IGNORECASE):
            false_sentence = re.sub(pattern, replacement, sentence, count=1, flags=re.IGNORECASE)
            return GeneratedQuestion(
                question_type="true_false",
                question_text=false_sentence,
                correct_answer="False",
                explanation=f'The source material actually states: "{sentence}"',
                difficulty=_difficulty_for_sentence(sentence),
            )
    return None


def _make_mcq(sentence: str, keywords: List[str], distractor_pool: List[str]) -> Optional[GeneratedQuestion]:
    words_in_sentence = set(w.lower() for w in _WORD.findall(sentence))
    candidates = [k for k in keywords if k.lower() in words_in_sentence]
    if not candidates:
        return None

    target = candidates[0]
    pattern = re.compile(rf"\b{re.escape(target)}\b", re.IGNORECASE)
    match = pattern.search(sentence)
    if not match:
        return None
    correct = match.group(0)

    distractors_source = [d for d in distractor_pool if d.lower() != correct.lower()]
    random.shuffle(distractors_source)
    distractors = distractors_source[:3]
    if len(distractors) < 3:
        return None

    display_correct = correct.title() if correct.islower() else correct
    options = [o.title() if o.islower() else o for o in distractors] + [display_correct]
    random.shuffle(options)

    question_text = pattern.sub("_____", sentence, count=1)
    return GeneratedQuestion(
        question_type="mcq",
        question_text=f"Which term correctly completes this statement? {question_text}",
        options=options,
        correct_answer=display_correct,
        explanation=f'"{display_correct}" is correct based on the source material: "{sentence}"',
        difficulty=_difficulty_for_sentence(sentence),
    )


def _make_short_answer(sentence: str) -> GeneratedQuestion:
    subject_match = re.match(r"^(A|An|The)\s+([\w\s]+?)\s+(is|are|follows|refers to)\b", sentence, re.IGNORECASE)
    if subject_match:
        subject = subject_match.group(2).strip()
        prompt = f"In your own words, explain what {subject} means, based on the material."
    else:
        prompt = f"In your own words, explain the following concept: \"{sentence[:80]}...\""

    return GeneratedQuestion(
        question_type="short_answer",
        question_text=prompt,
        correct_answer=sentence,
        explanation="Short-answer questions are graded manually or by keyword/semantic match against the source sentence.",
        difficulty=_difficulty_for_sentence(sentence),
    )


def generate_questions(
    chunk_texts: List[str],
    topic_labels: Optional[List[str]] = None,
    question_types: Optional[List[str]] = None,
    total_questions: int = 10,
) -> List[GeneratedQuestion]:
    question_types = question_types or ["mcq", "true_false", "fill_blank", "short_answer"]
    topic_labels = topic_labels or ["General"]

    all_sentences: List[str] = []
    for text in chunk_texts:
        all_sentences.extend(_sentences(text))

    if not all_sentences:
        return []

    keywords = _keyword_terms(chunk_texts)
    random.shuffle(all_sentences)

    questions: List[GeneratedQuestion] = []
    type_cycle = question_types * (total_questions // max(len(question_types), 1) + 1)

    sentence_pool = list(all_sentences)
    idx = 0
    for qtype in type_cycle:
        if len(questions) >= total_questions or not sentence_pool:
            break

        sentence = sentence_pool.pop(0)
        q: Optional[GeneratedQuestion] = None

        if qtype == "mcq":
            q = _make_mcq(sentence, keywords, keywords)
        elif qtype == "true_false":
            make_false = idx % 2 == 1
            q = _make_true_false(sentence, make_false)
        elif qtype == "fill_blank":
            q = _make_fill_blank(sentence, keywords)
        elif qtype == "short_answer":
            q = _make_short_answer(sentence)

        if q:
            q.topic = topic_labels[idx % len(topic_labels)]
            questions.append(q)
        idx += 1

    return questions[:total_questions]
