const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/notification.controller');

router.get('/', authenticateToken, ctrl.getNotifications);
router.get('/unread-count', authenticateToken, ctrl.getUnreadCount);
router.patch('/read-all', authenticateToken, ctrl.markAllAsRead);
router.patch('/:id/read', authenticateToken, ctrl.markAsRead);
router.delete('/:id', authenticateToken, ctrl.deleteNotification);

module.exports = router;
