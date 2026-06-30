const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const ctrl = require('../controllers/keyword-monitor.controller');

// Monitors CRUD
router.get('/monitors', authenticateToken, ctrl.getMonitors);
router.post('/monitors', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.createMonitor);
router.put('/monitors/:id', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.updateMonitor);
router.delete('/monitors/:id', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.deleteMonitor);

// Manual sync
router.post('/monitors/:id/sync', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.syncMonitor);

// Mentions feed
router.get('/mentions', authenticateToken, ctrl.getMentions);
router.patch('/mentions/:id/read', authenticateToken, ctrl.markMentionRead);
router.patch('/mentions/read-all', authenticateToken, ctrl.markAllRead);

module.exports = router;
