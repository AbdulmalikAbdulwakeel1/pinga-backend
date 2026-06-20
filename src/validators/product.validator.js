const { body, validationResult } = require('express-validator');

// Middleware to check validation results
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

// ─── Create Product ───────────────────────────────────────────
const validateCreateProduct = [
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required')
    .isLength({ min: 2, max: 255 }).withMessage('Product name must be 2-255 characters'),

  body('price')
    .notEmpty().withMessage('Price is required')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),

  body('stock')
    .optional()
    .isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),

  body('category_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Category ID must be a valid UUID'),

  body('images')
    .optional({ nullable: true })
    .isArray().withMessage('Images must be an array'),

  body('description')
    .optional({ nullable: true })
    .isLength({ max: 2000 }).withMessage('Description must not exceed 2000 characters'),

  body('compare_price')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Compare price must be a positive number'),

  body('sku')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 100 }).withMessage('SKU must not exceed 100 characters'),

  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean'),

  validate
];

// ─── Update Product ───────────────────────────────────────────
const validateUpdateProduct = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Product name must be 2-255 characters'),

  body('price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),

  body('stock')
    .optional()
    .isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),

  body('category_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID().withMessage('Category ID must be a valid UUID'),

  body('images')
    .optional({ nullable: true })
    .isArray().withMessage('Images must be an array'),

  body('description')
    .optional({ nullable: true })
    .isLength({ max: 2000 }).withMessage('Description must not exceed 2000 characters'),

  body('compare_price')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Compare price must be a positive number'),

  body('sku')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 100 }).withMessage('SKU must not exceed 100 characters'),

  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean'),

  validate
];

module.exports = {
  validateCreateProduct,
  validateUpdateProduct
};
