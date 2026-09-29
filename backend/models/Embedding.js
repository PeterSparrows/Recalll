const mongoose = require('mongoose');

// Metadata pointer only — the actual vector lives in the local FAISS index file.
const EmbeddingSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
    chunk: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialChunk', required: true },
    vector_store_path: { type: String, required: true }, // path to the .faiss index file
    vector_index: { type: Number, required: true }, // position within that FAISS index
    embedding_model: { type: String, required: true, default: 'tfidf-heuristic-v1' },
    dimension: { type: Number, required: true },
  },
  { timestamps: true }
);

EmbeddingSchema.index({ material: 1 });
EmbeddingSchema.index({ chunk: 1 }, { unique: true });

module.exports = mongoose.model('Embedding', EmbeddingSchema);
