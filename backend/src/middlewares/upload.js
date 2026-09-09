// Photo/document upload middleware. Parses multipart into memory (Multer
// memoryStorage); the active storage driver (local disk or GCS) persists the buffer
// (see services/storage). Buffering in memory makes the storage backend a runtime
// choice (STORAGE_DRIVER) with no controller changes. 5 MB cap; MIME-validated.
//
// TWO CHECKS, NOT ONE. Multer's fileFilter can only see the Content-Type the
// CLIENT declared, which is a claim, not evidence - curl will happily send
// `Content-Type: image/jpeg` with an HTML or SVG payload behind it. So every
// upload is also sniffed against its magic bytes after multer has buffered it,
// and file.mimetype is corrected to what the bytes actually say before the
// storage driver records it. SVG is the one that matters: it is a document that
// can carry script, it has no magic number, and it is not in either allow-list.

const multer = require('multer');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const IMAGE_MIME = /^image\/(jpe?g|png|webp|heic|heif)$/i;
const DOC_MIME = /^(image\/(jpe?g|png|webp|heic|heif)|application\/pdf)$/i;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Magic-number signatures for the formats this app accepts. Returns the real
// MIME type, or null when the bytes match nothing we allow.
function sniffMime(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';

  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  // WEBP is a RIFF container: "RIFF" <4-byte length> "WEBP".
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }

  // HEIC/HEIF are ISO-BMFF: a box length, then "ftyp", then the brand. Phone
  // cameras (iPhone especially) upload these directly, so they have to pass.
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
    return null; // some other ISO-BMFF file (mp4, mov) wearing an image name
  }

  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';

  return null;
}

function rejectUpload(message) {
  const err = new Error(message);
  err.statusCode = 422;
  return err;
}

// Runs after multer, when the buffer actually exists. Rewrites file.mimetype to
// the sniffed value so the storage driver stores a Content-Type the bytes
// support rather than one the client asserted.
function sniffGuard(allowedMime) {
  return function verifyFileBytes(req, res, next) {
    // .single() sets req.file; .array() sets req.files to an array; .fields()
    // sets it to an object keyed by field name. Flatten all three.
    let files = [];
    if (req.file) files = [req.file];
    else if (Array.isArray(req.files)) files = req.files;
    else if (req.files && typeof req.files === 'object') files = Object.values(req.files).flat();

    for (const file of files) {
      const actual = sniffMime(file.buffer);
      if (!actual || !allowedMime.test(actual)) {
        return next(
          rejectUpload(
            allowedMime === DOC_MIME
              ? 'That file is not a readable image or PDF. Please upload a photo or a PDF document.'
              : 'That file is not a readable image. Please upload a JPG, PNG, WEBP or HEIC photo.'
          )
        );
      }
      file.mimetype = actual;
    }

    return next();
  };
}

// Returns a multer-shaped object whose .single()/.array() each produce the
// multer middleware AND the byte check, as one array. Composing them here is
// deliberate: a separate guard the routes had to remember to add would
// eventually be forgotten on a new upload route, and the failure - trusting the
// client's Content-Type again - would be invisible.
// `subdir` is consumed later by storage.save(); it stays in the signature so
// route definitions are unchanged.
function diskUpload(subdir, allowedMime = IMAGE_MIME) {
  function fileFilter(req, file, cb) {
    if (allowedMime.test(file.mimetype)) return cb(null, true);
    return cb(
      rejectUpload(
        allowedMime === DOC_MIME
          ? 'Unsupported file type. Allowed: images or PDF.'
          : 'Only image files (jpg, png, webp, heic) are allowed.'
      )
    );
  }

  const mw = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: MAX_BYTES } });
  const guard = sniffGuard(allowedMime);

  return {
    single: (field) => [mw.single(field), guard],
    array: (field, maxCount) => [mw.array(field, maxCount), guard],
    fields: (spec) => [mw.fields(spec), guard],
  };
}

module.exports = { diskUpload, sniffMime, sniffGuard, UPLOAD_ROOT, IMAGE_MIME, DOC_MIME, MAX_BYTES };
