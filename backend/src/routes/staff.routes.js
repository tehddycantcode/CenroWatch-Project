// Staff routes — mounted at /api/v1/staff. Every endpoint requires an
// authenticated CENRO_Staff or Admin user. These return internal data (including
// reporter contact info) and drive the queues, detail views, and status workflow.

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { diskUpload, DOC_MIME, MAX_FILES } = require('../middlewares/upload');
const v = require('../validators/staff.validators');

// Chain-of-custody photos are images only; up to 10 per upload batch.
const custodyUpload = diskUpload('custody');
// Optional single photo when a staff logs a walk-in complaint.
const complaintUpload = diskUpload('complaints');
// Both names, like the resident routes: a cached staff bundle still posts the
// singular 'photo'. See utils/uploadFields.js.
const WALKIN_PHOTO_FIELDS = [{ name: 'photo', maxCount: 1 }, { name: 'photos', maxCount: MAX_FILES }];
// Photo showing the work was done, required to Resolve a complaint / Complete a request.
// IMAGE_MIME by default, which is right: this is a photograph of work.
const proofUpload = diskUpload('proof');
// The signed closure document scanned back in. DOC_MIME, NOT the default -
// a counter-signed certification comes off an office scanner as a PDF, and
// proofUpload would refuse it. Deliberately a separate uploader rather than
// widening proofUpload, so the work proof stays a photograph.
const certificateUpload = diskUpload('certificates', DOC_MIME);

const overview = require('../controllers/staff.overview.controller');
const office = require('../controllers/staff.office.controller');
const complaints = require('../controllers/staff.complaint.controller');
const wildlife = require('../controllers/staff.wildlife.controller');
const requests = require('../controllers/staff.request.controller');
const reports = require('../controllers/staff.report.controller');
const certificates = require('../controllers/closureCertificate.controller');

router.use(authenticate, authorize('CENRO_Staff', 'Admin'));

// Dashboard
router.get('/overview', overview.getOverview);

// Where the CENRO office is, so a report's detail view can say how far away it
// is. Read-only, no personal data; the settings themselves stay Admin-only
// under /admin/settings.
router.get('/office-location', office.getOfficeLocation);

// The driving route from the office to a report's pin. Needs ORS_API_KEY; with
// no key it answers 200 with route: null and the map keeps its straight line.
router.get('/route', v.routeQueryRules, validate, office.getRoute);

// Complaints
router.get('/complaints', v.listQueryRules, validate, complaints.list);
// Walk-in intake: multer first so multipart text fields populate req.body.
router.post('/complaints', complaintUpload.fields(WALKIN_PHOTO_FIELDS), v.createWalkInComplaintRules, validate, complaints.createWalkIn);
router.get('/complaints/:id', complaints.getOne);
router.get('/complaints/:id/report', reports.complaintReport);
router.patch('/complaints/:id/status', proofUpload.single('proof'), v.complaintStatusRules, validate, complaints.updateStatus);
router.patch('/complaints/:id', v.complaintUpdateRules, validate, complaints.update);
// The signed closure document. Its own endpoint, not a field on the status
// PATCH - the signed form comes back days after the work is done.
router.post('/complaints/:id/certificate', certificateUpload.single('certificate'), certificates.uploadComplaint);
router.delete('/complaints/:id/certificate', certificates.removeComplaint);

// Wildlife turnovers
router.get('/wildlife', v.listQueryRules, validate, wildlife.list);
router.get('/wildlife/:id', wildlife.getOne);
router.get('/wildlife/:id/report', reports.wildlifeReport);
router.patch('/wildlife/:id/status', v.wildlifeStatusRules, validate, wildlife.updateStatus);
router.patch('/wildlife/:id', v.wildlifeUpdateRules, validate, wildlife.update);
router.post('/wildlife/:id/custody-photos', custodyUpload.array('photos', 10), wildlife.addCustodyPhotos);
router.delete('/wildlife/:id/custody-photos', wildlife.removeCustodyPhoto);
router.post('/wildlife/:id/certificate', certificateUpload.single('certificate'), certificates.uploadWildlife);
router.delete('/wildlife/:id/certificate', certificates.removeWildlife);

// Environmental requests
router.get('/requests', v.listQueryRules, validate, requests.list);
router.get('/requests/:id', requests.getOne);
router.get('/requests/:id/report', reports.requestReport);
router.patch('/requests/:id/status', proofUpload.single('proof'), v.requestStatusRules, validate, requests.updateStatus);
router.patch('/requests/:id', v.requestUpdateRules, validate, requests.update);
router.post('/requests/:id/certificate', certificateUpload.single('certificate'), certificates.uploadRequest);
router.delete('/requests/:id/certificate', certificates.removeRequest);

module.exports = router;
