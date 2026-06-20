const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const ctrl = require('../controllers/team.controller');

router.get('/', authenticateToken, ctrl.getTeam);
router.post('/invite', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.inviteAgent);
router.put('/:id', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.updateTeamMember);
router.delete('/:id', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.removeTeamMember);

module.exports = router;
