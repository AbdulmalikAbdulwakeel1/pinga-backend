const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const ctrl = require('../controllers/ai-agent.controller');

// Settings
router.get('/settings', authenticateToken, ctrl.getSettings);
router.put('/settings', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.updateSettings);

// Templates
router.get('/templates', authenticateToken, ctrl.getTemplates);
router.post('/templates', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.createTemplate);
router.put('/templates/:id', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.updateTemplate);
router.delete('/templates/:id', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.deleteTemplate);

// Training & Testing
router.post('/train', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.addTrainingData);
router.post('/test', authenticateToken, ctrl.testAI);
router.get('/performance', authenticateToken, ctrl.getPerformance);

module.exports = router;
