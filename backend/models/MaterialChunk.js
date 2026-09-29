const mongoose = require('mongoose');

const MaterialChunkSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
    chunk_index: { type: Number, required: true, min: 0 },
    page_number: { type: Number, default: null },
    content: { type: String, required: true },
    topic_label: { type: String, default: null },
    token_count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MaterialChunkSchema.index({ material: 1, chunk_index: 1 }, { unique: true });

module.exports = mongoose.model('MaterialChunk', MaterialChunkSchema);
