// Service request routes — mounted at /api/v1/requests. All require auth.
// An optional supporting file (image or PDF) can be attached as "document".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const validate = require('../middlewares/validate');
const { diskUpload, DOC_MIME } = require('../middlewares/upload');
const { createRequestRules } = require('../validators/request.validators');
const controller = require('../controllers/request.controller');

const upload = diskUpload('requests', DOC_MIME);

router.use(authenticate);

// Filing needs a confirmed address; see middlewares/requireVerifiedEmail.js for
// why it sits after multer. READS STAY OPEN, so an unconfirmed resident does not
// lose sight of requests they filed before the gate existed.
router.post('/', upload.single('document'), requireVerifiedEmail, createRequestRules, validate, controller.create);
router.get('/mine', controller.listMine);
router.get('/:trackingId', controller.getByTracking);

module.exports = router;
