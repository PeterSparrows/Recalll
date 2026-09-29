"""
Chunking service: splits cleaned page text into overlapping,
sentence-aware chunks suitable for embedding and question generation.
"""
import re
from dataclasses import dataclass
from typing import List

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")


@dataclass
class Chunk:
    chunk_index: int
    page_number: int
    content: str
    token_count: int


def _split_sentences(text: str) -> List[str]:
    text = text.strip()
    if not text:
        return []
    sentences = _SENTENCE_SPLIT.split(text)
    return [s.strip() for s in sentences if s.strip()]


def _estimate_tokens(text: str) -> int:
    # Rough heuristic: ~0.75 words per token on average for English text.
    # Good enough for chunk-sizing decisions; not used for anything billed.
    return max(1, int(len(text.split()) / 0.75))


def chunk_pages(
    pages: List[dict],
    target_tokens: int = 220,
    overlap_tokens: int = 40,
) -> List[Chunk]:
    """
    pages: list of {"page_number": int, "text": str} (already cleaned)
    Produces overlapping chunks so context isn't lost at chunk boundaries
    — the tail of one chunk reappears at the head of the next.
    """
    chunks: List[Chunk] = []
    chunk_index = 0

    for page in pages:
        page_number = page["page_number"]
        sentences = _split_sentences(page["text"])
        if not sentences:
            continue

        current: List[str] = []
        current_tokens = 0

        i = 0
        while i < len(sentences):
            sentence = sentences[i]
            sentence_tokens = _estimate_tokens(sentence)

            if current_tokens + sentence_tokens > target_tokens and current:
                content = " ".join(current)
                chunks.append(
                    Chunk(
                        chunk_index=chunk_index,
                        page_number=page_number,
                        content=content,
                        token_count=current_tokens,
                    )
                )
                chunk_index += 1

                # Build overlap: keep trailing sentences worth ~overlap_tokens
                overlap: List[str] = []
                overlap_count = 0
                for s in reversed(current):
                    t = _estimate_tokens(s)
                    if overlap_count + t > overlap_tokens:
                        break
                    overlap.insert(0, s)
                    overlap_count += t

                current = overlap
                current_tokens = overlap_count

            current.append(sentence)
            current_tokens += sentence_tokens
            i += 1

        if current:
            content = " ".join(current)
            chunks.append(
                Chunk(
                    chunk_index=chunk_index,
                    page_number=page_number,
                    content=content,
                    token_count=current_tokens,
                )
            )
            chunk_index += 1

    return chunks
