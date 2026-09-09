// Serves locally stored uploads, but only to a caller holding a valid,
// unexpired signature for that exact file.
//
// This replaces `app.use('/uploads', express.static(UPLOAD_ROOT))`, which
// served every complaint photo, wildlife photo, chain-of-custody photo and
// request document to anyone at all - no session, no rate limit, no expiry.
// The tokens are minted by storage.signFiles() as each report is returned to a
// caller the API has already authorised, so a photo is only reachable by
// someone who was allowed to read the report it belongs to, and only for an
// hour. See utils/fileToken.js.
//
// Mounted OUTSIDE /api/v1 (the URL shape is baked into stored paths and into
// both clients' fileUrl helpers), so the global apiLimiter does not cover it -
// hence its own limiter here.

const express = require('express');
const fs = require('fs');
const path = require('path');

const { UPLOAD_ROOT } = require('../middlewares/upload');
const { verifyPath } = require('../utils/fileToken');
const { fileLimiter } = require('../middlewares/rateLimiters');

const router = express.Router();

function deny(res, status, message) {
  return res.status(status).json({ success: false, message });
}

router.use(fileLimiter);

// A plain middleware rather than router.get('/*'): Express 5 removed unnamed
// wildcards, and this has to match an arbitrarily nested path anyway.
router.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return deny(res, 405, 'Uploaded files are read-only.');
  }

  // req.path is the portion after the /uploads mount, still percent-encoded.
  let relPath;
  try {
    relPath = decodeURIComponent(req.path).replace(/^\/+/, '');
  } catch {
    return deny(res, 400, 'Malformed file path.');
  }

  if (!relPath) return deny(res, 404, 'File not found.');

  // Path traversal. Resolve against the root and confirm the result is still
  // inside it - checking for ".." in the string is not enough once encoding,
  // backslashes (Windows accepts them as separators) and symlinks are in play.
  // path.resolve collapses all of those before the comparison.
  const absolute = path.resolve(UPLOAD_ROOT, relPath.replace(/\\/g, '/'));
  const root = path.resolve(UPLOAD_ROOT);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return deny(res, 403, 'Forbidden.');
  }

  // Signature check BEFORE touching the filesystem, so a caller without a token
  // cannot tell an existing file from a missing one by timing or status code.
  const reason = verifyPath(relPath, { e: req.query.e, s: req.query.s });
  if (reason) return deny(res, 403, reason);

  fs.stat(absolute, (err, stats) => {
    if (err || !stats.isFile()) return deny(res, 404, 'File not found.');

    // Personal data: never cached by a shared proxy, and inline rather than
    // downloaded so <img> and the PDF preview behave normally.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    // The stored names are generated, but the header stops a browser from
    // MIME-sniffing an image into something executable.
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(absolute);
  });
});

module.exports = router;
