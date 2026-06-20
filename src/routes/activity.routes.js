const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const ctrl = require('../controllers/activity.controller');

router.get('/', authenticateToken, authorizeRoles('owner', 'admin'), ctrl.getActivity);

module.exports = router;
