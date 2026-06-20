const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/analytics.controller');

router.get('/dashboard', authenticateToken, ctrl.getDashboardStats);
router.get('/revenue', authenticateToken, ctrl.getRevenue);
router.get('/conversations', authenticateToken, ctrl.getConversationAnalytics);
router.get('/products', authenticateToken, ctrl.getProductAnalytics);

module.exports = router;
