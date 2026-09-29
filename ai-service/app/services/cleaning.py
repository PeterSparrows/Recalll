"""
Cleaning service: takes raw extracted text and normalizes it before
chunking — de-hyphenates words broken across line-wraps, collapses
noisy whitespace, strips common boilerplate (page numbers, repeated
headers/footers), and normalizes bullet characters.

This is entirely rule-based / regex-based (heuristic), not a model.
"""
import re

_HYPHEN_LINEBREAK = re.compile(r"(\w)-\n(\w)")
_MULTI_NEWLINE = re.compile(r"\n{3,}")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")
_PAGE_NUMBER_LINE = re.compile(r"^\s*(page\s*)?\d{1,4}\s*(of\s*\d{1,4})?\s*$", re.IGNORECASE)
_BULLET_CHARS = re.compile(r"^[\u2022\u25CF\u25A0\u2023\u2043\-\*]\s*", re.MULTILINE)
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def clean_text(raw_text: str) -> str:
    if not raw_text:
        return ""

    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")

    # Strip control characters that sometimes leak in from PDF extraction
    text = _CONTROL_CHARS.sub("", text)

    # Fix hyphenation across line wraps: "informa-\ntion" -> "information"
    text = _HYPHEN_LINEBREAK.sub(r"\1\2", text)

    # Drop lines that are just page numbers ("Page 3", "3 of 12", "3")
    lines = text.split("\n")
    lines = [ln for ln in lines if not _PAGE_NUMBER_LINE.match(ln.strip())]
    text = "\n".join(lines)

    # Normalize bullets to a consistent "- " prefix
    text = _BULLET_CHARS.sub("- ", text)

    # Collapse excess whitespace
    text = _MULTI_SPACE.sub(" ", text)
    text = _MULTI_NEWLINE.sub("\n\n", text)

    return text.strip()


def strip_repeated_lines(pages_text: list[str], min_repeats: int = 3) -> list[str]:
    """
    Removes lines that repeat verbatim across many pages (typical
    running headers/footers like a course code or document title
    printed on every page), which otherwise pollute every chunk.
    """
    from collections import Counter

    line_counts: Counter = Counter()
    per_page_lines = [p.split("\n") for p in pages_text]

    for lines in per_page_lines:
        seen_this_page = set(ln.strip() for ln in lines if ln.strip())
        for ln in seen_this_page:
            line_counts[ln] += 1

    boilerplate = {
        line for line, count in line_counts.items()
        if count >= min_repeats and len(line) < 120
    }

    cleaned_pages = []
    for lines in per_page_lines:
        kept = [ln for ln in lines if ln.strip() not in boilerplate]
        cleaned_pages.append("\n".join(kept))

    return cleaned_pages
