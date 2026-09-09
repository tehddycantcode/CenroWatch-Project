// Local-disk storage driver. Persists Multer (memory) buffers under
// UPLOAD_ROOT/<subdir>/ and serves them via the /uploads route in app.js.
//
// fileUrl is NO LONGER a pass-through. It used to return the stored path
// unchanged, which - with /uploads mounted as express.static - meant the value
// sitting in Complaint.photo_path was itself a working public URL that anyone
// could fetch without a session. It now returns a short-lived signed link, the
// same contract the GCS driver has always had (V4 signed URLs, 1-hour TTL), so
// the two drivers are no longer different security models wearing the same
// interface. See utils/fileToken.js for why signing beats a Bearer header here.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { UPLOAD_ROOT } = require('../../middlewares/upload');
const { signPath } = require('../../utils/fileToken');

function genFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.bin';
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

// Persist one in-memory Multer file. Returns "/uploads/<subdir>/<filename>".
// The DB keeps this bare path; the token is added at read time so it is always
// fresh, and so a stored value never carries a credential.
async function save(subdir, file) {
  const dir = path.join(UPLOAD_ROOT, subdir);
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = genFilename(file.originalname);
  await fs.promises.writeFile(path.join(dir, filename), file.buffer);
  return `/uploads/${subdir}/${filename}`;
}

// Resolve a stored "/uploads/<rel>" path to a signed, expiring URL.
async function fileUrl(storedPath) {
  if (!storedPath) return null;
  if (/^https?:\/\//.test(storedPath)) return storedPath; // already absolute
  const rel = storedPath.replace(/^\/uploads\//, '');
  return `/uploads/${signPath(rel)}`;
}

// Delete the underlying file (best-effort).
async function remove(storedPath) {
  if (!storedPath || !storedPath.startsWith('/uploads/')) return;
  const rel = storedPath.replace(/^\/uploads\//, '');
  await fs.promises.unlink(path.join(UPLOAD_ROOT, rel)).catch(() => {});
}

module.exports = { save, fileUrl, remove };
