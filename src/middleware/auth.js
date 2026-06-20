const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists and is active
    const result = await query(
      `SELECT id, business_id, email, role, is_active, account_locked_until
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. User not found.'
      });
    }

    const user = result.rows[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated.'
      });
    }

    // Check if account is locked
    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      return res.status(403).json({
        success: false,
        error: 'Account is temporarily locked. Please try again later.'
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      businessId: user.business_id,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please login again.'
      });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed.'
    });
  }
};

// Role-based authorization middleware
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

// Verify user belongs to the same business (tenant isolation)
const verifyBusiness = async (req, res, next) => {
  try {
    const businessId = req.params.businessId || req.body.businessId;

    if (businessId && businessId !== req.user.businessId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access resources from another business.'
      });
    }

    next();
  } catch (error) {
    console.error('Business verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authorization failed.'
    });
  }
};

// Optional authentication (for public/private endpoints)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(); // No token, continue without auth
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query(
      'SELECT id, business_id, email, role FROM users WHERE id = $1 AND is_active = true AND deleted_at IS NULL',
      [decoded.userId]
    );

    if (result.rows.length > 0) {
      req.user = {
        id: result.rows[0].id,
        businessId: result.rows[0].business_id,
        email: result.rows[0].email,
        role: result.rows[0].role
      };
    }
  } catch (error) {
    // Token invalid, but continue without auth
    console.log('Optional auth failed, continuing without authentication');
  }

  next();
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  verifyBusiness,
  optionalAuth
};
