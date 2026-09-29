const path = require('path');
const fs = require('fs/promises');
const { Material, MaterialChunk, Embedding, Course } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { fileTypeFromExt } = require('../middleware/upload.middleware');
const aiClient = require('../services/aiService.client');

/**
 * Runs the AI pipeline for a material in the background (fire-and-
 * forget from the request handler's perspective). The frontend polls
 * GET /api/materials/:id for status: uploaded -> processing -> analyzed|failed.
 */
async function processMaterialInBackground(materialId, absoluteFilePath, fileType) {
  try {
    await Material.findByIdAndUpdate(materialId, { status: 'processing' });

    const result = await aiClient.processDocument({
      filePath: absoluteFilePath,
      fileType,
      materialId: materialId.toString(),
    });

    const chunkDocs = await MaterialChunk.insertMany(
      result.chunks.map((c) => ({
        material: materialId,
        chunk_index: c.chunk_index,
        page_number: c.page_number,
        content: c.content,
        token_count: c.token_count,
      }))
    );

    // Map chunk_index -> inserted chunk _id so Embedding rows can reference them
    const chunkIdByIndex = new Map(chunkDocs.map((c) => [c.chunk_index, c._id]));

    await Embedding.insertMany(
      result.embeddings.map((e) => ({
        material: materialId,
        chunk: chunkIdByIndex.get(e.chunk_index),
        vector_store_path: result.vector_store_path,
        vector_index: e.vector_index,
        embedding_model: e.embedding_model,
        dimension: e.dimension,
      }))
    );

    await Material.findByIdAndUpdate(materialId, {
      status: 'analyzed',
      page_count: result.page_count,
      summary: result.summary,
      topics_detected: result.topics_detected,
      error_message: null,
    });
  } catch (err) {
    console.error(`[material processing] Failed for ${materialId}:`, err.message);
    await Material.findByIdAndUpdate(materialId, {
      status: 'failed',
      error_message: err.message || 'Unknown processing error',
    }).catch(() => {});
  }
}

// POST /api/materials/upload  (multipart/form-data, field "file")
const uploadMaterial = asyncHandler(async (req, res) => {
  const { course_id } = req.body;

  if (course_id) {
    const course = await Course.findOne({ _id: course_id, user: req.user._id });
    if (!course) throw new ApiError(404, 'Course not found.');
  }

  const fileType = fileTypeFromExt(req.file.originalname);

  const material = await Material.create({
    user: req.user._id,
    course: course_id || null,
    original_filename: req.file.originalname,
    stored_filename: req.file.filename,
    file_type: fileType,
    file_size_kb: Math.round(req.file.size / 1024),
    status: 'uploaded',
  });

  // Kick off processing without blocking the response — client polls status.
  const absolutePath = path.join(req.file.destination, req.file.filename);
  setImmediate(() => processMaterialInBackground(material._id, absolutePath, fileType));

  res.status(201).json({
    success: true,
    message: 'File uploaded. Processing started.',
    data: { material },
  });
});

// GET /api/materials/:id  (used for status polling)
const getMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findOne({ _id: req.params.id, user: req.user._id });
  if (!material) throw new ApiError(404, 'Material not found.');
  res.status(200).json({ success: true, data: { material } });
});

// GET /api/materials
const listMaterials = asyncHandler(async (req, res) => {
  const { course_id, status } = req.query;
  const filter = { user: req.user._id };
  if (course_id) filter.course = course_id;
  if (status) filter.status = status;

  const materials = await Material.find(filter).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: { materials } });
});

// GET /api/materials/:id/chunks
const getMaterialChunks = asyncHandler(async (req, res) => {
  const material = await Material.findOne({ _id: req.params.id, user: req.user._id });
  if (!material) throw new ApiError(404, 'Material not found.');

  const chunks = await MaterialChunk.find({ material: material._id }).sort({ chunk_index: 1 });
  res.status(200).json({ success: true, data: { chunks } });
});

// DELETE /api/materials/:id
const deleteMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findOne({ _id: req.params.id, user: req.user._id });
  if (!material) throw new ApiError(404, 'Material not found.');

  const filePath = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', material.stored_filename);
  await fs.unlink(filePath).catch(() => {}); // ignore if already gone

  await MaterialChunk.deleteMany({ material: material._id });
  await Embedding.deleteMany({ material: material._id });
  await material.deleteOne();

  res.status(200).json({ success: true, message: 'Material deleted.' });
});

module.exports = {
  uploadMaterial,
  getMaterial,
  listMaterials,
  getMaterialChunks,
  deleteMaterial,
};
