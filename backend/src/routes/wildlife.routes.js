// Wildlife turnover routes — mounted at /api/v1/wildlife. All require auth.
// Photo is an optional multipart field named "photo".

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const validate = require('../middlewares/validate');
const { diskUpload } = require('../middlewares/upload');
const { createWildlifeRules } = require('../validators/wildlife.validators');
const controller = require('../controllers/wildlife.controller');

const upload = diskUpload('wildlife');

router.use(authenticate);

// Filing needs a confirmed address; see middlewares/requireVerifiedEmail.js for
// why it sits after multer. READS STAY OPEN, so an unconfirmed resident does not
// lose sight of turnovers they reported before the gate existed.
router.post('/', upload.single('photo'), requireVerifiedEmail, createWildlifeRules, validate, controller.create);
router.get('/mine', controller.listMine);
router.get('/:referenceId', controller.getByRef);

module.exports = router;
