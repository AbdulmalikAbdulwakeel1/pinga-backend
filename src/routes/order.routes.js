const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/order.controller');
const { validateCreateOrder } = require('../validators/order.validator');

router.get('/', authenticateToken, ctrl.getOrders);
router.get('/:id', authenticateToken, ctrl.getOrder);
router.post('/', authenticateToken, validateCreateOrder, ctrl.createOrder);
router.patch('/:id/status', authenticateToken, ctrl.updateOrderStatus);
router.patch('/:id/payment', authenticateToken, ctrl.updatePaymentStatus);
router.post('/:id/timeline', authenticateToken, ctrl.addTimelineEntry);

module.exports = router;
