const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const ctrl = require('../controllers/integration.controller');

router.get('/', authenticateToken, ctrl.getIntegrations);
router.post('/instagram/connect', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.connectInstagram);
router.post('/facebook/connect', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.connectFacebook);
router.post('/whatsapp/connect', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.connectWhatsApp);
router.delete('/:platform', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.disconnectPlatform);

module.exports = router;
