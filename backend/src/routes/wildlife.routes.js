// Wildlife turnover routes — mounted at /api/v1/wildlife. All require auth.
// Photo is an optional multipart field named "photo".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { diskUpload } = require('../middlewares/upload');
const { createWildlifeRules } = require('../validators/wildlife.validators');
const controller = require('../controllers/wildlife.controller');

const upload = diskUpload('wildlife');

router.use(authenticate);

router.post('/', upload.single('photo'), createWildlifeRules, validate, controller.create);
router.get('/mine', controller.listMine);
router.get('/:referenceId', controller.getByRef);

module.exports = router;
