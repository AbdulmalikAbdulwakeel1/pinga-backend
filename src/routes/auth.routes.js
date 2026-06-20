const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const {
  validateBusinessRegistration,
  validateLogin,
  validateVerifyEmail,
  validateResendPin,
  validateEmail,
  validateResetPassword,
  validateVerifyResetPin,
  validateRefreshToken
} = require('../validators/auth.validator');
const { authLimiter } = require('../middleware/security');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new business with owner account
 * @access  Public
 */
router.post('/register', authLimiter, validateBusinessRegistration, authController.registerBusiness);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address with 4-digit PIN
 * @access  Public
 */
router.post('/verify-email', authLimiter, validateVerifyEmail, authController.verifyEmail);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification PIN
 * @access  Public
 */
router.post('/resend-verification', authLimiter, validateResendPin, authController.resendVerificationPin);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user (owner, agent)
 * @access  Public
 */
router.post('/login', authLimiter, validateLogin, authController.login);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Get new access token using refresh token
 * @access  Public
 */
router.post('/refresh-token', authLimiter, validateRefreshToken, authController.refreshToken);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset (sends 4-digit PIN)
 * @access  Public
 */
router.post('/forgot-password', authLimiter, validateEmail, authController.forgotPassword);

/**
 * @route   POST /api/v1/auth/verify-reset-pin
 * @desc    Verify password reset PIN
 * @access  Public
 */
router.post('/verify-reset-pin', authLimiter, validateVerifyResetPin, authController.verifyResetPin);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using verified PIN
 * @access  Public
 */
router.post('/reset-password', authLimiter, validateResetPassword, authController.resetPassword);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticateToken, authController.getProfile);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/profile', authenticateToken, authController.updateProfile);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
