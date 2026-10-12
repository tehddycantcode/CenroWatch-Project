// Wildlife turnover routes — mounted at /api/v1/wildlife. All require auth.
// A photo is REQUIRED (see the controller). Sent as "photo" by older clients,

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const validate = require('../middlewares/validate');
const { diskUpload, MAX_FILES } = require('../middlewares/upload');
const { createWildlifeRules } = require('../validators/wildlife.validators');
const controller = require('../controllers/wildlife.controller');

const upload = diskUpload('wildlife');

// "photo" (one file, what older clients send) and "photos" (up to MAX_FILES).
const PHOTO_FIELDS = [{ name: 'photo', maxCount: 1 }, { name: 'photos', maxCount: MAX_FILES }];

router.use(authenticate);

// Filing needs a confirmed address; see middlewares/requireVerifiedEmail.js for
// why it sits after multer. READS STAY OPEN, so an unconfirmed resident does not
// lose sight of turnovers they reported before the gate existed.
// BOTH FIELD NAMES ARE ACCEPTED, and that is what makes multi-upload safe to
// deploy. New clients send the plural field; every installed APK and every
// cached web bundle still sends the singular one. Dropping the singular would
// 422 those clients AFTER the resident had filled in the whole form - the
// failure shape CLAUDE.md records twice. The controller merges the two.
router.post('/', upload.fields(PHOTO_FIELDS), requireVerifiedEmail, createWildlifeRules, validate, controller.create);
router.get('/mine', controller.listMine);
router.get('/:referenceId', controller.getByRef);

module.exports = router;
