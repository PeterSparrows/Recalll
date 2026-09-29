"""
AI microservice entrypoint.

This service is called internally by the Node/Express backend only —
it is never exposed directly to the browser (no CORS opened to the
frontend origin; the Node backend proxies everything).

Run with: uvicorn app.main:app --reload --port 8000
"""
import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.schemas import (
    ProcessDocumentRequest,
    ProcessDocumentResponse,
    ChunkOut,
    EmbeddingMetaOut,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
    QuestionOut,
    SearchRequest,
    SearchResponse,
    SearchResultOut,
)
from app.services import (
    extraction,
    cleaning,
    chunking,
    embedding,
    vector_store,
    topic_detection,
    question_generation,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

app = FastAPI(
    title="Learning Assessment AI Microservice",
    description=(
        "Internal document-processing and question-generation service. "
        "Uses TF-IDF/SVD embeddings and rule-based NLP — see README for "
        "why, and how to upgrade to neural models."
    ),
    version="1.0.0",
)


@app.get("/health")
def health():
    return {"success": True, "message": "AI service is healthy"}


@app.post("/process-document", response_model=ProcessDocumentResponse)
def process_document(req: ProcessDocumentRequest):
    """
    Full pipeline: extract -> clean -> chunk -> embed -> index (FAISS)
    -> detect topics -> summarize. Returns everything the Node backend
    needs to persist Material/MaterialChunk/Embedding records.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    try:
        extraction_result = extraction.extract(req.file_path, req.file_type)
    except extraction.UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except extraction.ExtractionFailedError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Clean each page, then strip cross-page repeated boilerplate (headers/footers)
    cleaned_page_texts = [cleaning.clean_text(p.text) for p in extraction_result.pages]
    cleaned_page_texts = cleaning.strip_repeated_lines(cleaned_page_texts)

    pages_for_chunking = [
        {"page_number": p.page_number, "text": cleaned_page_texts[i]}
        for i, p in enumerate(extraction_result.pages)
    ]

    doc_chunks = chunking.chunk_pages(pages_for_chunking)
    if not doc_chunks:
        raise HTTPException(status_code=422, detail="No usable text could be chunked from this document.")

    chunk_texts = [c.content for c in doc_chunks]

    topics = topic_detection.detect_topics(chunk_texts)
    full_clean_text = "\n\n".join(cleaned_page_texts)
    summary = topic_detection.generate_extractive_summary(full_clean_text)

    emb_result = embedding.embed_chunks(chunk_texts)
    vs_path = vector_store.build_and_save_index(req.material_id, emb_result.vectors, emb_result.transformer)

    embeddings_meta = [
        EmbeddingMetaOut(
            chunk_index=c.chunk_index,
            vector_index=i,
            embedding_model=emb_result.model_name,
            dimension=emb_result.dimension,
        )
        for i, c in enumerate(doc_chunks)
    ]

    logger.info(f"Processed material {req.material_id}: {len(doc_chunks)} chunks, {len(topics)} topics")

    return ProcessDocumentResponse(
        success=True,
        page_count=extraction_result.page_count,
        summary=summary,
        topics_detected=topics,
        chunks=[
            ChunkOut(
                chunk_index=c.chunk_index,
                page_number=c.page_number,
                content=c.content,
                token_count=c.token_count,
            )
            for c in doc_chunks
        ],
        embeddings=embeddings_meta,
        vector_store_path=vs_path,
    )


@app.post("/generate-questions", response_model=GenerateQuestionsResponse)
def generate_questions_endpoint(req: GenerateQuestionsRequest):
    if not req.chunk_texts:
        raise HTTPException(status_code=400, detail="chunk_texts must not be empty.")
    if req.total_questions < 1 or req.total_questions > 100:
        raise HTTPException(status_code=400, detail="total_questions must be between 1 and 100.")

    generated = question_generation.generate_questions(
        chunk_texts=req.chunk_texts,
        topic_labels=req.topic_labels,
        question_types=req.question_types,
        total_questions=req.total_questions,
    )

    return GenerateQuestionsResponse(
        success=True,
        questions=[
            QuestionOut(
                question_type=q.question_type,
                question_text=q.question_text,
                options=q.options,
                correct_answer=q.correct_answer,
                explanation=q.explanation,
                difficulty=q.difficulty,
                topic=q.topic,
            )
            for q in generated
        ],
    )


@app.post("/search", response_model=SearchResponse)
def search_endpoint(req: SearchRequest):
    """
    Semantic-ish search within a material: loads the SAME fitted
    TF-IDF+SVD transformer that was used to build this material's
    FAISS index (persisted at process-document time), embeds the
    query with it, then does a FAISS similarity search. Reusing the
    fitted transformer (rather than refitting on the query) is what
    keeps query and index vectors in the same comparable space.
    """
    if not os.path.exists(req.vector_store_path):
        raise HTTPException(status_code=404, detail="Vector store not found for this material.")

    material_id = vector_store.material_id_from_index_path(req.vector_store_path)
    try:
        transformer = vector_store.load_transformer(material_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    query_vector = embedding.embed_query(transformer, req.query_text)

    try:
        results = vector_store.search(req.vector_store_path, query_vector, top_k=req.top_k)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return SearchResponse(
        success=True,
        results=[SearchResultOut(vector_index=idx, score=score) for idx, score in results],
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.exception("Unhandled error in AI service")
    return JSONResponse(status_code=500, content={"success": False, "message": "Internal AI service error."})
