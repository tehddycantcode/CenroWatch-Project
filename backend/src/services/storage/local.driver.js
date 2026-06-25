// Local-disk storage driver. Persists Multer (memory) buffers under
// UPLOAD_ROOT/<subdir>/ and serves them via the /uploads static mount (gated to
// this driver in app.js). fileUrl is a pass-through: the stored path IS the URL.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { UPLOAD_ROOT } = require('../../middlewares/upload');

function genFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.bin';
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

// Persist one in-memory Multer file. Returns "/uploads/<subdir>/<filename>".
async function save(subdir, file) {
  const dir = path.join(UPLOAD_ROOT, subdir);
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = genFilename(file.originalname);
  await fs.promises.writeFile(path.join(dir, filename), file.buffer);
  return `/uploads/${subdir}/${filename}`;
}

// Local files are served directly by the static mount; the stored path is the URL.
async function fileUrl(storedPath) {
  return storedPath || null;
}

// Delete the underlying file (best-effort).
async function remove(storedPath) {
  if (!storedPath || !storedPath.startsWith('/uploads/')) return;
  const rel = storedPath.replace(/^\/uploads\//, '');
  await fs.promises.unlink(path.join(UPLOAD_ROOT, rel)).catch(() => {});
}

module.exports = { save, fileUrl, remove };
