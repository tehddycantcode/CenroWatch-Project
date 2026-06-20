// Service request routes — mounted at /api/v1/requests. All require auth.
// An optional supporting file (image or PDF) can be attached as "document".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { diskUpload, DOC_MIME } = require('../middlewares/upload');
const { createRequestRules } = require('../validators/request.validators');
const controller = require('../controllers/request.controller');

const upload = diskUpload('requests', DOC_MIME);

router.use(authenticate);

router.post('/', upload.single('document'), createRequestRules, validate, controller.create);
router.get('/mine', controller.listMine);
router.get('/:trackingId', controller.getByTracking);

module.exports = router;
