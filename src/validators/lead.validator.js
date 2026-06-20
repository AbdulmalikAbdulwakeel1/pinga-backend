const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

const VALID_PLATFORMS = ['instagram', 'facebook', 'whatsapp'];
const VALID_STAGES = ['New', 'Contacted', 'Qualified', 'Negotiating', 'Won', 'Lost'];
const VALID_SCORES = ['hot', 'warm', 'cold'];

// ─── Create Lead ──────────────────────────────────────────────
const validateCreateLead = [
  body('name')
    .trim()
    .notEmpty().withMessage('Lead name is required')
    .isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters'),

  body('platform')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(VALID_PLATFORMS).withMessage(`Platform must be one of: ${VALID_PLATFORMS.join(', ')}`),

  body('stage')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(VALID_STAGES).withMessage(`Stage must be one of: ${VALID_STAGES.join(', ')}`),

  body('score')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(VALID_SCORES).withMessage(`Score must be one of: ${VALID_SCORES.join(', ')}`),

  body('value')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Value must be a positive number'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 20 }).withMessage('Phone must not exceed 20 characters'),

  body('contact_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Contact ID must be a valid UUID'),

  body('conversation_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Conversation ID must be a valid UUID'),

  body('assigned_to')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Assigned to must be a valid UUID'),

  validate
];

// ─── Update Lead ──────────────────────────────────────────────
const validateUpdateLead = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters'),

  body('platform')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(VALID_PLATFORMS).withMessage(`Platform must be one of: ${VALID_PLATFORMS.join(', ')}`),

  body('score')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(VALID_SCORES).withMessage(`Score must be one of: ${VALID_SCORES.join(', ')}`),

  body('value')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Value must be a positive number'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 20 }).withMessage('Phone must not exceed 20 characters'),

  body('assigned_to')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Assigned to must be a valid UUID'),

  validate
];

module.exports = {
  validateCreateLead,
  validateUpdateLead
};
