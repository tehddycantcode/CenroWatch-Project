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

router.use(authenticate);

// Filing needs a confirmed address; see middlewares/requireVerifiedEmail.js for
// why it sits after multer. READS STAY OPEN, so an unconfirmed resident does not
// lose sight of requests they filed before the gate existed.
router.post('/', upload.fields(REQUEST_FIELDS), requireVerifiedEmail, createRequestRules, validate, controller.create);
router.get('/mine', controller.listMine);
router.get('/:trackingId', controller.getByTracking);

module.exports = router;
