// Root API v1 router.
// Feature routers (auth, complaints, wildlife, requests, gis, admin) are mounted
// here as they are built in Sprints 1–4.

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    name: process.env.APP_NAME || 'CENROWATCH',
    office: process.env.OFFICE || 'CENRO Cabuyao',
    version: 'v1',
    message: 'CENROWATCH API. Feature endpoints are added per sprint.',
    docs: 'See README.md and the development plan for the full endpoint list.',
  });
});

// Sprint 1
router.use('/auth', require('./auth.routes'));
router.use('/barangays', require('./barangay.routes'));
router.use('/categories', require('./category.routes'));

// Sprint 2
router.use('/complaints', require('./complaint.routes'));
router.use('/wildlife', require('./wildlife.routes'));
router.use('/requests', require('./request.routes'));
router.use('/gis', require('./gis.routes'));
router.use('/notifications', require('./notification.routes'));

// Sprint 3 — CENRO Staff interface (role-gated inside the router)
router.use('/staff', require('./staff.routes'));

// Sprint 4 — Admin analytics & management (Admin-only inside the router)
router.use('/admin', require('./admin.routes'));

module.exports = router;
