// Notification routes — mounted at /api/v1/notifications. All require auth;
// a user only ever sees and mutates their own notifications.

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const controller = require('../controllers/notification.controller');

router.use(authenticate);

router.get('/', controller.list);
router.patch('/read-all', controller.markAllRead); // literal — declared before /:id/read
router.patch('/:id/read', controller.markRead);

module.exports = router;
