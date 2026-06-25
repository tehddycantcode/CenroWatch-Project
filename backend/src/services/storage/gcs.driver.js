// Google Cloud Storage driver. Uploads Multer (memory) buffers to a private bucket
// (uniform bucket-level access) and serves them via short-lived V4 signed URLs.
// Objects are never made public. Used only when STORAGE_DRIVER=gcs; requiring this
// module validates configuration and fails fast at boot.

const path = require('path');
const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');

const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

function buildClient() {
  const projectId = process.env.GCS_PROJECT_ID || undefined;
  if (process.env.GCS_CREDENTIALS_JSON) {
    let credentials;
    try {
      credentials = JSON.parse(process.env.GCS_CREDENTIALS_JSON);
    } catch {
      throw new Error('GCS_CREDENTIALS_JSON is set but is not valid JSON.');
    }
    return new Storage({ projectId: projectId || credentials.project_id, credentials });
  }
  if (process.env.GCS_KEY_FILE) {
    return new Storage({ projectId, keyFilename: process.env.GCS_KEY_FILE });
  }
  throw new Error('GCS storage requires GCS_CREDENTIALS_JSON or GCS_KEY_FILE.');
}

const bucketName = process.env.GCS_BUCKET_NAME;
if (!bucketName) throw new Error('GCS storage requires GCS_BUCKET_NAME.');
const bucket = buildClient().bucket(bucketName);

function genFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.bin';
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

// Upload one in-memory Multer file. Returns "/uploads/<subdir>/<filename>" — the same
// shape the local driver uses, so the stored DB value is driver-agnostic.
async function save(subdir, file) {
  const name = `${subdir}/${genFilename(file.originalname)}`;
  await bucket.file(name).save(file.buffer, {
    resumable: false,
    contentType: file.mimetype,
    metadata: { cacheControl: 'private, max-age=0' },
  });
  return `/uploads/${name}`;
}

// Resolve a stored "/uploads/<object>" path to a 1-hour V4 signed read URL.
async function fileUrl(storedPath) {
  if (!storedPath) return null;
  if (/^https?:\/\//.test(storedPath)) return storedPath; // already absolute
  const name = storedPath.replace(/^\/uploads\//, '');
  const [url] = await bucket.file(name).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });
  return url;
}

// Delete the underlying object (best-effort).
async function remove(storedPath) {
  if (!storedPath || /^https?:\/\//.test(storedPath)) return;
  const name = storedPath.replace(/^\/uploads\//, '');
  await bucket.file(name).delete({ ignoreNotFound: true }).catch(() => {});
}

module.exports = { save, fileUrl, remove };
