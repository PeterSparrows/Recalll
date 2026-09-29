const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const UPLOAD_DIR = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
const MAX_SIZE_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 25) * 1024 * 1024;

// extension -> allowed MIME types. We check BOTH, never trust either alone.
const ALLOWED_TYPES = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.txt': ['text/plain'],
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Randomized, unpredictable filename — NEVER derived from the
    // original filename or any other user-controlled input, so path
    // traversal / injection via filename is not possible.
    const randomName = crypto.randomBytes(24).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomName}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ALLOWED_TYPES[ext];

  if (!allowedMimes) {
    return cb(new ApiError(400, `Unsupported file extension: ${ext || '(none)'}. Allowed: pdf, docx, pptx, txt.`));
  }

  if (!allowedMimes.includes(file.mimetype)) {
    return cb(
      new ApiError(
        400,
        `File extension "${ext}" does not match its content type "${file.mimetype}". This may indicate a mislabeled or malicious file.`
      )
    );
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
});

// Wraps multer's single-file upload so multer-specific errors (file
// too large, wrong field name, etc.) become clean ApiError responses
// instead of raw multer errors reaching the client.
function uploadMaterialFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(413, `File too large. Maximum size is ${MAX_SIZE_BYTES / (1024 * 1024)}MB.`));
      }
      return next(new ApiError(400, `Upload error: ${err.message}`));
    }
    if (err) return next(err);
    if (!req.file) {
      return next(new ApiError(400, 'No file was uploaded. Use field name "file".'));
    }
    next();
  });
}

function fileTypeFromExt(originalname) {
  const ext = path.extname(originalname).toLowerCase().replace('.', '');
  return ext; // 'pdf' | 'docx' | 'pptx' | 'txt'
}

module.exports = { uploadMaterialFile, fileTypeFromExt, UPLOAD_DIR };
