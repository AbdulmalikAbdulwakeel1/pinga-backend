const router = require('express').Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const ctrl = require('../controllers/product.controller');
const { validateCreateProduct, validateUpdateProduct } = require('../validators/product.validator');

router.get('/', authenticateToken, ctrl.getProducts);
router.get('/:id', authenticateToken, ctrl.getProduct);
router.get('/:id/orders', authenticateToken, ctrl.getProductOrders);
router.post('/', authenticateToken, validateCreateProduct, ctrl.createProduct);
router.put('/:id', authenticateToken, validateUpdateProduct, ctrl.updateProduct);
router.delete('/:id', authenticateToken, ctrl.deleteProduct);
router.patch('/:id/toggle', authenticateToken, ctrl.toggleActive);

module.exports = router;
