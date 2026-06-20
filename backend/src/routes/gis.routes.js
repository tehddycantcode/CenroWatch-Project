// Public GIS routes — mounted at /api/v1/gis. No auth; ZERO personal data.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/gis.controller');

router.get('/map', controller.map);
router.get('/stats', controller.stats);
router.get('/feed', controller.feed);

module.exports = router;
