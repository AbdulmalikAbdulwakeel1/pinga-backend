const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/category.controller');

router.get('/', authenticateToken, ctrl.getCategories);
router.post('/', authenticateToken, ctrl.createCategory);
router.put('/:id', authenticateToken, ctrl.updateCategory);
router.delete('/:id', authenticateToken, ctrl.deleteCategory);

module.exports = router;
