// Service request routes — mounted at /api/v1/requests. All require auth.
// An optional supporting file (image or PDF) can be attached as "document".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const validate = require('../middlewares/validate');
const { diskUpload, DOC_MIME, MAX_FILES } = require('../middlewares/upload');
const { createRequestRules } = require('../validators/request.validators');
const controller = require('../controllers/request.controller');
const residentReports = require('../controllers/resident.report.controller');
const signedReportLink = require('../middlewares/signedReportLink');
const feedback = require('../controllers/feedback.controller');
const { submitFeedbackRules } = require('../validators/feedback.validators');

const upload = diskUpload('requests', DOC_MIME);

// Four names on one route. The singular pair is what older clients send; the
// plural pair is multi-upload. DOC_MIME covers both, so a request photo and a
// request document go through the same filter and differ only in which column
// the controller files them under.
const REQUEST_FIELDS = [
  { name: 'document', maxCount: 1 },
  { name: 'documents', maxCount: MAX_FILES },
  { name: 'photo', maxCount: 1 },
  { name: 'photos', maxCount: MAX_FILES },
];

// The resident's own PDF copy. Declared ABOVE the authenticate gate only so a
// short-lived signed link can reach it from the phone's browser, which has
// neither a cookie nor a Bearer header. Not public: a request with no signature
// is handed straight to `authenticate`, and one with a signature is refused
// unless the HMAC verifies. See middlewares/signedReportLink.js.
router.get('/:trackingId/report', signedReportLink('request', 'trackingId'), residentReports.requestCopy);

router.use(authenticate);

// Filing needs a confirmed address; see middlewares/requireVerifiedEmail.js for
// why it sits after multer. READS STAY OPEN, so an unconfirmed resident does not
// lose sight of requests they filed before the gate existed.
router.post('/', upload.fields(REQUEST_FIELDS), requireVerifiedEmail, createRequestRules, validate, controller.create);
router.get('/mine', controller.listMine);
// Mints the signed link the route above accepts, after the same ownership load.
router.get('/:trackingId/report-link', residentReports.requestLink);
// Service feedback, once the case is closed. Ownership, the terminal-state rule
// and one-per-case all live in feedback.service.
router.get('/:trackingId/feedback', feedback.mineRequest);
router.post('/:trackingId/feedback', submitFeedbackRules, validate, feedback.submitRequest);
router.get('/:trackingId', controller.getByTracking);

module.exports = router;
