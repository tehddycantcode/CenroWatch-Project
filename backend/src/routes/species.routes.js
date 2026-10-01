// Public wildlife species list — mounted at /api/v1/species.
// Backs the species picker on both report forms and the public species guide,
// which used to read a hardcoded array shipped in each client's bundle.

const express = require('express');
const router = express.Router();

const speciesController = require('../controllers/species.controller');

router.get('/', speciesController.listActive);

module.exports = router;
