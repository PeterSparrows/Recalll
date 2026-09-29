"""
Topic detection + extractive summarization service.

Fully local, rule-based / classical-ML (TF-IDF + KMeans + sentence
scoring) — no neural model, no external downloads. Explicitly a
heuristic, documented as such in the README.
"""
import re
from typing import List, Dict
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")


def detect_topics(chunk_texts: List[str], max_topics: int = 6) -> List[str]:
    """
    Clusters chunks with KMeans over TF-IDF vectors, then labels each
    cluster with its top-weighted terms. This gives a small set of
    human-readable topic labels for the whole document.
    """
    if not chunk_texts:
        return []

    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_df=1.0 if len(chunk_texts) < 5 else 0.9,
        min_df=1,
        ngram_range=(1, 2),
    )
    matrix = vectorizer.fit_transform(chunk_texts)
    terms = np.array(vectorizer.get_feature_names_out())

    n_clusters = min(max_topics, matrix.shape[0])
    if n_clusters < 1:
        return []

    if n_clusters == 1:
        # Not enough chunks to cluster meaningfully — just take top terms overall
        scores = np.asarray(matrix.sum(axis=0)).flatten()
        top_idx = scores.argsort()[::-1][:3]
        label = _format_topic_label(terms[top_idx])
        return [label] if label else []

    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    km.fit(matrix)

    topics = []
    seen_labels = set()
    for cluster_idx in range(n_clusters):
        center = km.cluster_centers_[cluster_idx]
        top_term_idx = center.argsort()[::-1][:3]
        label = _format_topic_label(terms[top_term_idx])
        if label and label not in seen_labels:
            topics.append(label)
            seen_labels.add(label)

    return topics


def _format_topic_label(top_terms: np.ndarray) -> str:
    cleaned = [t.title() for t in top_terms if t.strip()]
    if not cleaned:
        return ""
    # Use the single strongest term as the label; it reads more like a
    # topic name than a run-on phrase of three stacked terms.
    return cleaned[0]


def generate_extractive_summary(full_text: str, max_sentences: int = 5) -> str:
    """
    Scores each sentence by the sum of its words' TF-IDF weights
    (a classic extractive-summarization heuristic) and returns the
    top-scoring sentences, restored to their original order.
    """
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(full_text) if s.strip()]
    if not sentences:
        return ""
    if len(sentences) <= max_sentences:
        return " ".join(sentences)

    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform(sentences)
    sentence_scores = np.asarray(matrix.sum(axis=1)).flatten()

    top_indices = sentence_scores.argsort()[::-1][:max_sentences]
    top_indices_sorted = sorted(top_indices)  # restore original reading order

    return " ".join(sentences[i] for i in top_indices_sorted)
