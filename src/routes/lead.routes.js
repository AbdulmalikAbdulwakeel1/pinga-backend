const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/lead.controller');
const { validateCreateLead, validateUpdateLead } = require('../validators/lead.validator');

router.get('/kanban', authenticateToken, ctrl.getKanban);
router.get('/', authenticateToken, ctrl.getLeads);
router.get('/:id', authenticateToken, ctrl.getLead);
router.post('/', authenticateToken, validateCreateLead, ctrl.createLead);
router.put('/:id', authenticateToken, validateUpdateLead, ctrl.updateLead);
router.patch('/:id/stage', authenticateToken, ctrl.updateStage);
router.patch('/:id/score', authenticateToken, ctrl.updateScore);
router.delete('/:id', authenticateToken, ctrl.deleteLead);

module.exports = router;
