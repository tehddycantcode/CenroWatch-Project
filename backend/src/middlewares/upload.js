// Photo/document upload middleware. Parses multipart into memory (Multer
// memoryStorage); the active storage driver (local disk or GCS) persists the buffer
// (see services/storage). Buffering in memory makes the storage backend a runtime
// choice (STORAGE_DRIVER) with no controller changes. 5 MB cap; MIME-validated.

const multer = require('multer');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const IMAGE_MIME = /^image\/(jpe?g|png|webp|heic|heif)$/i;
const DOC_MIME = /^(image\/(jpe?g|png|webp|heic|heif)|application\/pdf)$/i;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Returns a Multer instance that MIME/size-validates and buffers the file in memory.
// `subdir` is consumed later by storage.save(); it stays in the signature so route
// definitions are unchanged.
function diskUpload(subdir, allowedMime = IMAGE_MIME) {
  function fileFilter(req, file, cb) {
    if (allowedMime.test(file.mimetype)) return cb(null, true);
    const err = new Error(
      allowedMime === DOC_MIME
        ? 'Unsupported file type. Allowed: images or PDF.'
        : 'Only image files (jpg, png, webp, heic) are allowed.'
    );
    err.statusCode = 422;
    return cb(err);
  }

  return multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: MAX_BYTES } });
}

module.exports = { diskUpload, UPLOAD_ROOT, IMAGE_MIME, DOC_MIME };
