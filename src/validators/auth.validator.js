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

// ─── Business Registration ────────────────────────────────────
const validateBusinessRegistration = [
  body('businessName')
    .trim()
    .notEmpty().withMessage('Business name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Business name must be 2-100 characters'),

  body('businessEmail')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please enter a valid business email')
    .normalizeEmail(),

  body('ownerFirstName')
    .trim()
    .notEmpty().withMessage('Owner first name is required')
    .isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('First name contains invalid characters'),

  body('ownerLastName')
    .trim()
    .notEmpty().withMessage('Owner last name is required')
    .isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Last name contains invalid characters'),

  body('ownerEmail')
    .trim()
    .notEmpty().withMessage('Owner email is required')
    .isEmail().withMessage('Please enter a valid owner email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  validate
];

// ─── Login ────────────────────────────────────────────────────
const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),

  validate
];

// ─── Verify Email PIN ─────────────────────────────────────────
const validateVerifyEmail = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  body('pin')
    .trim()
    .notEmpty().withMessage('PIN is required')
    .matches(/^\d{4}$/).withMessage('PIN must be a 4-digit number'),

  validate
];

// ─── Resend Verification PIN ──────────────────────────────────
const validateResendPin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  validate
];

// ─── Email only (forgot password) ────────────────────────────
const validateEmail = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  validate
];

// ─── Verify Reset PIN ─────────────────────────────────────────
const validateVerifyResetPin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  body('pin')
    .trim()
    .notEmpty().withMessage('PIN is required')
    .matches(/^\d{4}$/).withMessage('PIN must be a 4-digit number'),

  validate
];

// ─── Reset Password ───────────────────────────────────────────
const validateResetPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  validate
];

// ─── Refresh Token ────────────────────────────────────────────
const validateRefreshToken = [
  body('refreshToken')
    .notEmpty().withMessage('Refresh token is required'),

  validate
];

module.exports = {
  validateBusinessRegistration,
  validateLogin,
  validateVerifyEmail,
  validateResendPin,
  validateEmail,
  validateVerifyResetPin,
  validateResetPassword,
  validateRefreshToken
};
