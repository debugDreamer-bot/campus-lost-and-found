const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { getMyNotifications, markAllRead, markRead } = require('../controllers/notificationController');

router.use(verifyToken);

router.get('/', getMyNotifications);
router.put('/read', markAllRead);
router.put('/:id/read', markRead);

module.exports = router;
