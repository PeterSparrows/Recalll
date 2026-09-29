"""
Embedding service.

HONEST NOTE ON WHAT THIS IS:
This project's spec suggests sentence-transformers (all-MiniLM-L6-v2)
for embeddings. Those weights download from the HuggingFace Hub at
runtime, which this environment cannot reach. So this module ships a
fully local alternative: TF-IDF vectors reduced to a fixed dimension
with Truncated SVD (a form of Latent Semantic Analysis). This is a
real, classical NLP technique — not a placeholder — and produces
genuine dense vectors suitable for FAISS similarity search. It is
just not a neural embedding model.

IMPORTANT: TF-IDF+SVD is a FITTED transform — the vector space it
produces depends on the vocabulary/statistics of whatever corpus it
was fit on. That means the SAME fitted vectorizer+SVD must be reused
to embed a later search query; refitting a new one on a different set
of texts produces a different, incomparable vector space. This module
therefore returns the fitted transformer so callers (see
vector_store.py) can persist it next to the FAISS index and reuse it
at query time.

To upgrade to real sentence-transformer embeddings on a machine with
HuggingFace access, see README.md "Upgrading to Real Local Models" —
that swap removes this fit/reuse requirement entirely, since neural
embedding models embed each text independently.
"""
from dataclasses import dataclass
from typing import List
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD

EMBEDDING_MODEL_NAME = "tfidf-svd-heuristic-v1"
EMBEDDING_DIMENSION = 64


@dataclass
class EmbeddingResult:
    vectors: np.ndarray  # shape (n_chunks, dimension), L2-normalized
    model_name: str
    dimension: int
    transformer: "_FittedTransformer"  # fitted vectorizer+SVD, needed to embed future queries comparably


def _normalize(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (matrix / norms).astype("float32")


class _FittedTransformer:
    """Lightweight, picklable wrapper: TF-IDF vectorizer -> TruncatedSVD."""

    def __init__(self, vectorizer: TfidfVectorizer, svd: TruncatedSVD):
        self.vectorizer = vectorizer
        self.svd = svd

    def transform(self, texts: List[str]) -> np.ndarray:
        return self.svd.transform(self.vectorizer.transform(texts))


def embed_chunks(chunk_texts: List[str], dimension: int = EMBEDDING_DIMENSION) -> EmbeddingResult:
    """
    Fits TF-IDF + SVD on the given chunk texts and returns a dense,
    L2-normalized vector per chunk, plus the fitted transformer so the
    exact same vector space can be reused for later queries against
    this material (see embed_query below).
    """
    n = len(chunk_texts)
    if n == 0:
        empty_vectorizer = TfidfVectorizer()
        empty_svd = TruncatedSVD(n_components=1)
        return EmbeddingResult(
            vectors=np.zeros((0, dimension)), model_name=EMBEDDING_MODEL_NAME,
            dimension=dimension, transformer=_FittedTransformer(empty_vectorizer, empty_svd),
        )

    vectorizer = TfidfVectorizer(
        max_df=1.0 if n < 5 else 0.95,
        min_df=1,
        stop_words="english",
        ngram_range=(1, 2),
    )
    tfidf_matrix = vectorizer.fit_transform(chunk_texts)

    # SVD components can't exceed min(n_samples, n_features) - 1
    effective_dim = max(1, min(dimension, tfidf_matrix.shape[0] - 1, tfidf_matrix.shape[1] - 1))

    svd = TruncatedSVD(n_components=effective_dim, random_state=42)
    reduced = svd.fit_transform(tfidf_matrix)

    if effective_dim < dimension:
        padded = np.zeros((n, dimension))
        padded[:, :effective_dim] = reduced
        reduced = padded

    return EmbeddingResult(
        vectors=_normalize(reduced),
        model_name=EMBEDDING_MODEL_NAME,
        dimension=dimension,
        transformer=_FittedTransformer(vectorizer, svd),
    )


def embed_query(transformer: _FittedTransformer, query_text: str, dimension: int = EMBEDDING_DIMENSION) -> np.ndarray:
    """
    Embeds a single query using an ALREADY-FITTED transformer (loaded
    from disk — see vector_store.save_transformer/load_transformer),
    so the result lives in the same vector space as the stored index.
    """
    reduced = transformer.transform([query_text])
    effective_dim = reduced.shape[1]
    if effective_dim < dimension:
        padded = np.zeros((1, dimension))
        padded[:, :effective_dim] = reduced
        reduced = padded
    return _normalize(reduced)[0]
