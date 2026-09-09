// Public report-category list — mounted at /api/v1/categories.
// Backs the complaint and service-request dropdowns on web and mobile, which
// used to read a hardcoded array shipped in the bundle.

const express = require('express');
const router = express.Router();

const categoryController = require('../controllers/category.controller');

router.get('/', categoryController.listActive);

module.exports = router;
