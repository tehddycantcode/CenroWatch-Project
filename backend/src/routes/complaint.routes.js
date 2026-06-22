// Complaint routes — mounted at /api/v1/complaints.
// Photo is an optional multipart field named "photo".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { diskUpload } = require('../middlewares/upload');
const { createComplaintRules, createAnonymousComplaintRules } = require('../validators/complaint.validators');
const controller = require('../controllers/complaint.controller');

const upload = diskUpload('complaints');

// --- PUBLIC (no auth): anonymous/whistleblower reporting + status lookup ---
// Registered before the authenticate gate. /track/:trackingId is matched before
// the authenticated /:trackingId because it is declared first and is more specific.
router.post('/anonymous', upload.single('photo'), createAnonymousComplaintRules, validate, controller.createAnonymous);
router.get('/track/:trackingId', controller.trackPublic);

// --- Everything below requires authentication ---
router.use(authenticate);

// Multer runs first so multipart text fields populate req.body before validation.
router.post('/', upload.single('photo'), createComplaintRules, validate, controller.create);
router.get('/mine', controller.listMine);
router.get('/:trackingId', controller.getByTracking);

module.exports = router;
