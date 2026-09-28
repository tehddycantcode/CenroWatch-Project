// Complaint routes — mounted at /api/v1/complaints.
// Photo is an optional multipart field named "photo".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const validate = require('../middlewares/validate');
const { diskUpload } = require('../middlewares/upload');
const { createComplaintRules, createAnonymousComplaintRules } = require('../validators/complaint.validators');
const controller = require('../controllers/complaint.controller');

const upload = diskUpload('complaints');

// --- PUBLIC (no auth): anonymous/whistleblower reporting + status lookup ---
// Registered before the authenticate gate. /track/:trackingId is matched before
// the authenticated /:trackingId because it is declared first and is more specific.
//
// NEITHER OF THESE IS EMAIL-GATED, and that is deliberate rather than an
// oversight: there is no account here to have confirmed an address on. The
// anonymous route is also the honest fallback for someone the gate below refuses.
router.post('/anonymous', upload.single('photo'), createAnonymousComplaintRules, validate, controller.createAnonymous);
router.get('/track/:trackingId', controller.trackPublic);

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
router.post('/', upload.single('photo'), requireVerifiedEmail, createComplaintRules, validate, controller.create);
// READS STAY OPEN. An unconfirmed resident must keep seeing reports they filed
// before the gate existed; withholding those punishes them for a slow mailbox.
router.get('/mine', controller.listMine);
router.get('/:trackingId', controller.getByTracking);

module.exports = router;
