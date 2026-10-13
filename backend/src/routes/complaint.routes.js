// Complaint routes — mounted at /api/v1/complaints.
// Photo is an optional multipart field named "photo".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const validate = require('../middlewares/validate');
const { diskUpload, MAX_FILES } = require('../middlewares/upload');
const { createComplaintRules, createAnonymousComplaintRules } = require('../validators/complaint.validators');
const controller = require('../controllers/complaint.controller');
const residentReports = require('../controllers/resident.report.controller');
const signedReportLink = require('../middlewares/signedReportLink');

const upload = diskUpload('complaints');

// "photo" (one file, what older clients send) and "photos" (up to MAX_FILES).
const PHOTO_FIELDS = [{ name: 'photo', maxCount: 1 }, { name: 'photos', maxCount: MAX_FILES }];

// --- PUBLIC (no auth): anonymous/whistleblower reporting + status lookup ---
// Registered before the authenticate gate. /track/:trackingId is matched before
// the authenticated /:trackingId because it is declared first and is more specific.
//
// NEITHER OF THESE IS EMAIL-GATED, and that is deliberate rather than an
// oversight: there is no account here to have confirmed an address on. The
// anonymous route is also the honest fallback for someone the gate below refuses.
// BOTH FIELD NAMES ARE ACCEPTED, and that is what makes multi-upload safe to
// deploy. New clients send the plural field; every installed APK and every
// cached web bundle still sends the singular one. Dropping the singular would
// 422 those clients AFTER the resident had filled in the whole form - the
// failure shape CLAUDE.md records twice. The controller merges the two.
router.post('/anonymous', upload.fields(PHOTO_FIELDS), createAnonymousComplaintRules, validate, controller.createAnonymous);
router.get('/track/:trackingId', controller.trackPublic);

// The resident's own PDF copy.
//
// DECLARED HERE, ABOVE the authenticate gate, ONLY so a short-lived signed link
// can reach it - the phone's browser has no cookie and no Bearer header, and
// the native module that would avoid needing a browser would cut every
// installed APK off from OTA updates. It is NOT public: signedReportLink hands
// a request with no signature straight to `authenticate`, so the web app takes
// exactly the path it took before, and a request WITH one is refused unless the
// HMAC verifies. The service's ownership check runs either way.
//
// Two segments, so it collides with neither /track/:trackingId above nor
// /:trackingId below.
router.get('/:trackingId/report', signedReportLink('complaint', 'trackingId'), residentReports.complaintCopy);

// --- Everything below requires authentication ---
router.use(authenticate);

// Multer runs first so multipart text fields populate req.body before validation.
//
// requireVerifiedEmail sits AFTER multer and BEFORE the validators. After multer
// because upload uses memoryStorage and storage.save() only runs in the
// controller, so nothing is persisted by the time the refusal happens - no orphan
// file, no burned tracking id, no audit row - and because refusing before the
// body has been read risks resetting the socket on a multi-megabyte photo over
// mobile data, which the app would report as "Could not reach the server. Check
// your Wi-Fi" instead of showing the 403 that explains what to do.
router.post('/', upload.fields(PHOTO_FIELDS), requireVerifiedEmail, createComplaintRules, validate, controller.create);
// READS STAY OPEN. An unconfirmed resident must keep seeing reports they filed
// before the gate existed; withholding those punishes them for a slow mailbox.
router.get('/mine', controller.listMine);
// Mints the signed link the route above accepts. Authenticated normally, and it
// loads the report through the same ownership check first, so a link only ever
// exists for a report the caller could already open.
router.get('/:trackingId/report-link', residentReports.complaintLink);
router.get('/:trackingId', controller.getByTracking);

module.exports = router;
