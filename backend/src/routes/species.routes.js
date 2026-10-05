// Public wildlife species list — mounted at /api/v1/species.
//
// Unauthenticated on purpose: this is meant to feed the species picker on both
// report forms AND the public species guide, which is reachable without an
// account. The response carries zero personal data (R.A. 10173), and
// species.service.js restricts it to an explicit field allowlist so a column
// added to the model later cannot silently widen it.
//
// It exists to retire the hardcoded species array each client still ships in
// its own bundle today - once a client reads this instead, adding a species
// needs no web deploy or app release.

const express = require('express');
const router = express.Router();

const speciesController = require('../controllers/species.controller');

router.get('/', speciesController.listActive);

module.exports = router;
