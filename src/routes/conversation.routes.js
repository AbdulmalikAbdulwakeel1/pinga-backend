const router = require('express').Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const ctrl = require('../controllers/conversation.controller');

router.get('/', authenticateToken, ctrl.getConversations);
router.get('/:id', authenticateToken, ctrl.getConversation);
router.patch('/:id', authenticateToken, ctrl.updateConversation);
router.patch('/:id/ai-toggle', authenticateToken, ctrl.toggleAI);
router.get('/:id/messages', authenticateToken, ctrl.getMessages);
router.post('/:id/messages', authenticateToken, ctrl.sendMessage);
router.patch('/:id/read-all', authenticateToken, ctrl.markAsRead);

module.exports = router;
