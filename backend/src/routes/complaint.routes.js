// Complaint routes — mounted at /api/v1/complaints. All require authentication.
// Photo is an optional multipart field named "photo".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { diskUpload } = require('../middlewares/upload');
const { createComplaintRules } = require('../validators/complaint.validators');
const controller = require('../controllers/complaint.controller');

const upload = diskUpload('complaints');

router.use(authenticate);

// Multer runs first so multipart text fields populate req.body before validation.
router.post('/', upload.single('photo'), createComplaintRules, validate, controller.create);
router.get('/mine', controller.listMine);
router.get('/:trackingId', controller.getByTracking);

module.exports = router;
