// Notification routes — mounted at /api/v1/notifications. All require auth;
// a user only ever sees and mutates their own notifications.

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const controller = require('../controllers/notification.controller');

router.use(authenticate);

router.get('/', controller.list);
// Device registration for push. Literal paths, so they are declared before the
// /:id route below for the same reason /read-all is.
router.post('/devices', controller.registerDevice);
router.delete('/devices', controller.unregisterDevice);
router.patch('/read-all', controller.markAllRead); // literal — declared before /:id/read
router.patch('/:id/read', controller.markRead);

module.exports = router;
