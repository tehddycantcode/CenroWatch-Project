// Barangay routes — mounted at /api/v1/barangays.
// Public read-only list for registration / report-filing dropdowns.

const express = require('express');
const router = express.Router();

const barangayController = require('../controllers/barangay.controller');

router.get('/', barangayController.list);

module.exports = router;
