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

const validateCreateOrder = [
  body('customerName')
    .trim()
    .notEmpty().withMessage('Customer name is required')
    .isLength({ min: 1, max: 255 }).withMessage('Customer name must be 1-255 characters'),

  body('customerPhone')
    .trim()
    .notEmpty().withMessage('Customer phone is required')
    .isLength({ min: 7, max: 20 }).withMessage('Customer phone must be 7-20 characters'),

  body('customerEmail')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('Please enter a valid customer email')
    .normalizeEmail(),

  body('items')
    .notEmpty().withMessage('Order items are required')
    .isArray({ min: 1 }).withMessage('Items must be a non-empty array'),

  body('items.*.productName')
    .trim()
    .notEmpty().withMessage('Each item must have a product name'),

  body('items.*.quantity')
    .isInt({ min: 1 }).withMessage('Each item quantity must be at least 1'),

  body('items.*.price')
    .isFloat({ min: 0 }).withMessage('Each item price must be a positive number'),

  body('total')
    .notEmpty().withMessage('Total amount is required')
    .isFloat({ min: 0.01 }).withMessage('Total must be a positive number'),

  body('deliveryAddress')
    .trim()
    .notEmpty().withMessage('Delivery address is required')
    .isLength({ min: 5, max: 500 }).withMessage('Delivery address must be 5-500 characters'),

  body('paymentMethod')
    .optional()
    .isIn(['transfer', 'cod', 'card']).withMessage('Payment method must be one of: transfer, cod, card'),

  body('platform')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['instagram', 'facebook', 'whatsapp']).withMessage('Platform must be one of: instagram, facebook, whatsapp'),

  body('subtotal')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Subtotal must be a positive number'),

  body('deliveryFee')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Delivery fee must be a non-negative number'),

  body('contactId')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Contact ID must be a valid UUID'),

  body('leadId')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Lead ID must be a valid UUID'),

  body('conversationId')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Conversation ID must be a valid UUID'),

  validate
];

module.exports = { validateCreateOrder };
