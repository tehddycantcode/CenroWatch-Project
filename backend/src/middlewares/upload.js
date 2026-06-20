// Photo upload middleware — LOCAL-DISK STUB (Sprint 2, option A).
// Files are stored under backend/uploads/<subdir> and served read-only at
// /uploads/... by app.js. Swapping to Google Cloud Storage later is a change
// isolated to this file + the controller's path construction — no UI changes.

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const IMAGE_MIME = /^image\/(jpe?g|png|webp|heic|heif)$/i;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function diskUpload(subdir) {
  const dest = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dest, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  });

  function fileFilter(req, file, cb) {
    if (IMAGE_MIME.test(file.mimetype)) return cb(null, true);
    const err = new Error('Only image files (jpg, png, webp, heic) are allowed.');
    err.statusCode = 422;
    return cb(err);
  }

  return multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES } });
}

// Public URL path stored in the DB and served by the static mount.
function publicPathFor(subdir, filename) {
  return `/uploads/${subdir}/${filename}`;
}

module.exports = { diskUpload, publicPathFor, UPLOAD_ROOT };
