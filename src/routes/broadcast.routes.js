const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const ctrl = require('../controllers/broadcast.controller');

router.get('/', authenticateToken, ctrl.getBroadcasts);
router.get('/:id', authenticateToken, ctrl.getBroadcast);
router.post('/', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.createBroadcast);
router.put('/:id', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.updateBroadcast);
router.delete('/:id', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.deleteBroadcast);
router.post('/:id/send', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.sendBroadcast);

module.exports = router;
