"""
Vector store service — wraps a local FAISS index per material.
MongoDB (on the Node side) stores only metadata pointers (see the
Embedding model); the actual float vectors live in these .faiss files
on disk, exactly as the spec requires.

Alongside each .faiss file we also persist the fitted TF-IDF+SVD
transformer (as a .pkl) that produced its vectors. This is required
because TF-IDF+SVD is a *fitted* transform — a later search query
must be embedded with the SAME fitted vectorizer, not a freshly-fit
one, or the resulting vector lives in a different, incomparable space.
"""
import os
import pickle
import faiss
import numpy as np
from typing import List, Tuple

VECTOR_STORE_DIR = os.environ.get("VECTOR_STORE_DIR", "vector_stores")


def _index_path(material_id: str) -> str:
    os.makedirs(VECTOR_STORE_DIR, exist_ok=True)
    return os.path.join(VECTOR_STORE_DIR, f"{material_id}.faiss")


def _transformer_path(material_id: str) -> str:
    os.makedirs(VECTOR_STORE_DIR, exist_ok=True)
    return os.path.join(VECTOR_STORE_DIR, f"{material_id}.transformer.pkl")


def build_and_save_index(material_id: str, vectors: np.ndarray, transformer=None) -> str:
    """
    Builds a flat inner-product FAISS index (vectors are pre-normalized,
    so inner product == cosine similarity) and persists it to disk,
    along with the fitted transformer if provided. Returns the path
    where the FAISS index was saved.
    """
    dimension = vectors.shape[1] if vectors.ndim == 2 else 0
    index = faiss.IndexFlatIP(dimension)
    if vectors.shape[0] > 0:
        index.add(vectors)

    path = _index_path(material_id)
    faiss.write_index(index, path)

    if transformer is not None:
        with open(_transformer_path(material_id), "wb") as f:
            pickle.dump(transformer, f)

    return path


def load_transformer(material_id: str):
    path = _transformer_path(material_id)
    if not os.path.exists(path):
        raise FileNotFoundError(f"No fitted transformer found for material {material_id}")
    with open(path, "rb") as f:
        return pickle.load(f)


def material_id_from_index_path(vector_store_path: str) -> str:
    base = os.path.basename(vector_store_path)
    return base[: -len(".faiss")] if base.endswith(".faiss") else base


def load_index(path: str) -> faiss.Index:
    if not os.path.exists(path):
        raise FileNotFoundError(f"No vector store found at {path}")
    return faiss.read_index(path)


def search(path: str, query_vector: np.ndarray, top_k: int = 5) -> List[Tuple[int, float]]:
    """Returns [(vector_index, similarity_score), ...] sorted best-first."""
    index = load_index(path)
    query = query_vector.reshape(1, -1).astype("float32")
    scores, indices = index.search(query, min(top_k, index.ntotal) if index.ntotal > 0 else 0)
    results = []
    for idx, score in zip(indices[0], scores[0]):
        if idx == -1:
            continue
        results.append((int(idx), float(score)))
    return results
