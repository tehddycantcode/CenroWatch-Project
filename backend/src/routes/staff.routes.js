// Staff routes — mounted at /api/v1/staff. Every endpoint requires an
// authenticated CENRO_Staff or Admin user. These return internal data (including
// reporter contact info) and drive the queues, detail views, and status workflow.

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { diskUpload } = require('../middlewares/upload');
const v = require('../validators/staff.validators');

// Chain-of-custody photos are images only; up to 10 per upload batch.
const custodyUpload = diskUpload('custody');
// Optional single photo when a staff logs a walk-in complaint.
const complaintUpload = diskUpload('complaints');

const overview = require('../controllers/staff.overview.controller');
const complaints = require('../controllers/staff.complaint.controller');
const wildlife = require('../controllers/staff.wildlife.controller');
const requests = require('../controllers/staff.request.controller');
const reports = require('../controllers/staff.report.controller');

router.use(authenticate, authorize('CENRO_Staff', 'Admin'));

// Dashboard
router.get('/overview', overview.getOverview);

// Complaints
router.get('/complaints', v.listQueryRules, validate, complaints.list);
// Walk-in intake: multer first so multipart text fields populate req.body.
router.post('/complaints', complaintUpload.single('photo'), v.createWalkInComplaintRules, validate, complaints.createWalkIn);
router.get('/complaints/:id', complaints.getOne);
router.get('/complaints/:id/report', reports.complaintReport);
router.patch('/complaints/:id/status', v.complaintStatusRules, validate, complaints.updateStatus);
router.patch('/complaints/:id', v.complaintUpdateRules, validate, complaints.update);

// Wildlife turnovers
router.get('/wildlife', v.listQueryRules, validate, wildlife.list);
router.get('/wildlife/:id', wildlife.getOne);
router.get('/wildlife/:id/report', reports.wildlifeReport);
router.patch('/wildlife/:id/status', v.wildlifeStatusRules, validate, wildlife.updateStatus);
router.patch('/wildlife/:id', v.wildlifeUpdateRules, validate, wildlife.update);
router.post('/wildlife/:id/custody-photos', custodyUpload.array('photos', 10), wildlife.addCustodyPhotos);
router.delete('/wildlife/:id/custody-photos', wildlife.removeCustodyPhoto);

// Environmental requests
router.get('/requests', v.listQueryRules, validate, requests.list);
router.get('/requests/:id', requests.getOne);
router.get('/requests/:id/report', reports.requestReport);
router.patch('/requests/:id/status', v.requestStatusRules, validate, requests.updateStatus);
router.patch('/requests/:id', v.requestUpdateRules, validate, requests.update);

module.exports = router;
