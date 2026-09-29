from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ProcessDocumentRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to the uploaded file on disk")
    file_type: str = Field(..., description="One of: pdf, docx, pptx, txt")
    material_id: str = Field(..., description="Mongo ObjectId of the Material, used to name the FAISS index")


class ChunkOut(BaseModel):
    chunk_index: int
    page_number: int
    content: str
    token_count: int


class EmbeddingMetaOut(BaseModel):
    chunk_index: int
    vector_index: int
    embedding_model: str
    dimension: int


class ProcessDocumentResponse(BaseModel):
    success: bool
    page_count: int
    summary: str
    topics_detected: List[str]
    chunks: List[ChunkOut]
    embeddings: List[EmbeddingMetaOut]
    vector_store_path: str


class GenerateQuestionsRequest(BaseModel):
    chunk_texts: List[str]
    topic_labels: Optional[List[str]] = None
    question_types: List[str] = Field(default_factory=lambda: ["mcq", "true_false", "fill_blank", "short_answer"])
    total_questions: int = 10


class QuestionOut(BaseModel):
    question_type: str
    question_text: str
    options: List[str] = []
    correct_answer: str
    explanation: str
    difficulty: str
    topic: str


class GenerateQuestionsResponse(BaseModel):
    success: bool
    questions: List[QuestionOut]


class SearchRequest(BaseModel):
    vector_store_path: str
    query_text: str
    top_k: int = 5


class SearchResultOut(BaseModel):
    vector_index: int
    score: float


class SearchResponse(BaseModel):
    success: bool
    results: List[SearchResultOut]


class ErrorResponse(BaseModel):
    success: bool = False
    message: str
