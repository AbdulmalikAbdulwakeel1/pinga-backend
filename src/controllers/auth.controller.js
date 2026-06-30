const bcryptjs = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, transaction } = require('../config/database');
const {
  sendVerificationPinEmail,
  sendPasswordResetPinEmail,
  sendWelcomeEmail
} = require('../utils/email');

// ─── Helpers ──────────────────────────────────────────────────

const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: '5h' }
  );
};

const generatePin = () => crypto.randomInt(1000, 9999).toString();

const hashPin = (pin) => crypto.createHash('sha256').update(pin).digest('hex');

// ─── Business Registration ────────────────────────────────────
exports.registerBusiness = async (req, res) => {
  try {
    const {
      businessName,
      businessCategory,
      businessSize,
      city,
      state,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      password
    } = req.body;

    // businessEmail falls back to ownerEmail; phone accepts either field name
    const businessEmail = req.body.businessEmail || ownerEmail;
    const businessPhone = req.body.businessPhone || req.body.phone || null;

    // Check if business email already exists
    const bizExists = await query(
      'SELECT id FROM businesses WHERE email = $1',
      [businessEmail]
    );

    if (bizExists.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'A business with this email already exists'
      });
    }

    // Check if owner email already exists
    const ownerExists = await query(
      'SELECT id FROM users WHERE email = $1',
      [ownerEmail]
    );

    if (ownerExists.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'A user with this email already exists'
      });
    }

    // Hash password
    const passwordHash = await bcryptjs.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    // Generate 4-digit verification PIN
    const pin = generatePin();
    const pinHash = hashPin(pin);
    const pinExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const result = await transaction(async (client) => {
      // Create business record
      const bizResult = await client.query(
        `INSERT INTO businesses (name, email, phone, category, size, city, state, country)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, email`,
        [
          businessName,
          businessEmail,
          businessPhone,
          businessCategory || null,
          businessSize || null,
          city || null,
          state || null,
          'Nigeria'
        ]
      );

      const business = bizResult.rows[0];

      // Create owner user
      const userResult = await client.query(
        `INSERT INTO users (
          business_id, first_name, last_name, email, password_hash, role,
          is_active, is_email_verified,
          email_verification_pin, email_verification_pin_expires
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, first_name, last_name, email, role, is_email_verified`,
        [
          business.id,
          ownerFirstName,
          ownerLastName,
          ownerEmail,
          passwordHash,
          'owner',
          true,
          false,
          pinHash,
          pinExpires
        ]
      );

      return { business, user: userResult.rows[0] };
    });

    // Send verification PIN (fire-and-forget)
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n🔑 DEV — Verification PIN for ${ownerEmail}: ${pin}\n`);
    }
    sendVerificationPinEmail(ownerEmail, ownerFirstName, pin).catch(err => {
      console.error('Verification email failed:', err.message);
    });

    res.status(201).json({
      success: true,
      message: 'Business registered successfully. Please check your email for the verification PIN.',
      data: {
        business: {
          id: result.business.id,
          name: result.business.name,
          email: result.business.email
        },
        user: {
          id: result.user.id,
          firstName: result.user.first_name,
          lastName: result.user.last_name,
          email: result.user.email,
          role: result.user.role,
          isEmailVerified: result.user.is_email_verified
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
};

// ─── Verify Email with 4-digit PIN ───────────────────────────
exports.verifyEmail = async (req, res) => {
  try {
    const { email, pin } = req.body;

    const pinHash = hashPin(pin);

    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.business_id, u.is_email_verified,
              b.name as business_name
       FROM users u
       JOIN businesses b ON u.business_id = b.id
       WHERE u.email = $1
         AND u.email_verification_pin = $2
         AND u.email_verification_pin_expires > NOW()
         AND u.deleted_at IS NULL`,
      [email, pinHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired PIN. Please request a new one.'
      });
    }

    const user = result.rows[0];

    if (user.is_email_verified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified.'
      });
    }

    // Mark email as verified
    await query(
      `UPDATE users
       SET is_email_verified = true,
           email_verification_pin = NULL,
           email_verification_pin_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    const accessToken = generateToken(user.id, user.email, user.role);

    // Send welcome email (fire-and-forget)
    sendWelcomeEmail(user.email, user.first_name, user.business_name).catch(err => {
      console.error('Welcome email failed:', err);
    });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. Welcome to Pinga!',
      data: {
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: user.role,
          businessId: user.business_id,
          businessName: user.business_name,
          isEmailVerified: true
        },
        tokens: { accessToken }
      }
    });

  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      error: 'Email verification failed. Please try again.'
    });
  }
};

// ─── Resend Verification PIN ─────────────────────────────────
exports.resendVerificationPin = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await query(
      `SELECT id, first_name, business_id, is_email_verified
       FROM users
       WHERE email = $1 AND deleted_at IS NULL AND is_active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a new verification PIN has been sent.'
      });
    }

    const user = result.rows[0];

    if (user.is_email_verified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified.'
      });
    }

    const pin = generatePin();
    const pinHash = hashPin(pin);
    const pinExpires = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `UPDATE users
       SET email_verification_pin = $1,
           email_verification_pin_expires = $2
       WHERE id = $3`,
      [pinHash, pinExpires, user.id]
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`\n🔑 DEV — Resend verification PIN for ${email}: ${pin}\n`);
    }
    sendVerificationPinEmail(email, user.first_name, pin).catch(err => {
      console.error('Resend verification email failed:', err.message);
    });

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a new verification PIN has been sent.'
    });

  } catch (error) {
    console.error('Resend verification PIN error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend verification PIN. Please try again.'
    });
  }
};

// ─── Login ───────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await query(
      `SELECT u.*, b.name as business_name, b.is_active as business_active
       FROM users u
       JOIN businesses b ON u.business_id = b.id
       WHERE u.email = $1 AND u.deleted_at IS NULL
       ORDER BY u.is_active DESC, u.updated_at DESC
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    let user = result.rows[0];

    // Auto-reset failed login attempts if 6+ hours have passed since last attempt
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    if (
      user.failed_login_attempts > 0 &&
      new Date(user.updated_at) < sixHoursAgo &&
      (!user.account_locked_until || new Date(user.account_locked_until) < new Date())
    ) {
      await query('UPDATE users SET failed_login_attempts = 0 WHERE id = $1', [user.id]);
      user.failed_login_attempts = 0;
    }

    // Check if account is locked
    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.account_locked_until) - new Date()) / 60000);
      return res.status(403).json({
        success: false,
        error: `Account is temporarily locked. Please try again in ${minutesLeft} minutes.`
      });
    }

    // Verify password
    const isPasswordValid = await bcryptjs.compare(password, user.password_hash);

    if (!isPasswordValid) {
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;

      if (newAttempts >= maxAttempts) {
        const lockoutDuration = parseInt(process.env.LOCKOUT_DURATION) || 900000;
        await query(
          `UPDATE users SET failed_login_attempts = $1, account_locked_until = NOW() + INTERVAL '1 millisecond' * $2 WHERE id = $3`,
          [newAttempts, lockoutDuration, user.id]
        );
        return res.status(403).json({
          success: false,
          error: 'Account locked due to too many failed login attempts. Please try again in 15 minutes.'
        });
      }

      await query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [newAttempts, user.id]);

      return res.status(401).json({
        success: false,
        error: `Invalid email or password. ${maxAttempts - newAttempts} attempts remaining.`
      });
    }

    // Check account status after password confirmed
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Your account has been deactivated. Please contact support.'
      });
    }

    if (!user.is_email_verified) {
      return res.status(403).json({
        success: false,
        error: 'Please verify your email before logging in.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    if (!user.business_active) {
      return res.status(403).json({
        success: false,
        error: 'Business account is inactive. Please contact support.'
      });
    }

    // Reset failed attempts and update last login
    await query(
      'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const accessToken = generateToken(user.id, user.email, user.role);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: user.role,
          businessId: user.business_id,
          businessName: user.business_name,
          isEmailVerified: user.is_email_verified
        },
        tokens: { accessToken }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};

// ─── Refresh Token ───────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const result = await query(
      `SELECT u.id, u.email, u.role, u.is_active, u.account_locked_until,
              b.is_active as business_active
       FROM users u
       JOIN businesses b ON u.business_id = b.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid token. User not found.' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated.' });
    }

    if (!user.business_active) {
      return res.status(403).json({ success: false, error: 'Business account is inactive.' });
    }

    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      return res.status(403).json({ success: false, error: 'Account is temporarily locked.' });
    }

    const accessToken = generateToken(user.id, user.email, user.role);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: { tokens: { accessToken } }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid refresh token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Refresh token expired. Please login again.' });
    }
    console.error('Refresh token error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh token.' });
  }
};

// ─── Get Current User Profile ────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.role,
              u.avatar_url, u.is_active, u.is_email_verified,
              u.last_login, u.created_at,
              b.id as business_id, b.name as business_name, b.email as business_email,
              b.phone as business_phone, b.category as business_category,
              b.size as business_size, b.city, b.state, b.country,
              b.logo_url, b.description, b.website_url, b.subscription
       FROM users u
       JOIN businesses b ON u.business_id = b.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get connected platforms
    const platformsResult = await query(
      `SELECT platform, account_name, is_active FROM platform_connections
       WHERE business_id = $1 AND deleted_at IS NULL AND is_active = true`,
      [result.rows[0].business_id]
    );
    const connectedPlatforms = platformsResult.rows.map(p => p.platform);

    const u = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        avatar: u.avatar_url,
        isEmailVerified: u.is_email_verified,
        isActive: u.is_active,
        lastLogin: u.last_login,
        createdAt: u.created_at,
        business: {
          id: u.business_id,
          name: u.business_name,
          email: u.business_email,
          phone: u.business_phone,
          category: u.business_category,
          size: u.business_size,
          city: u.city,
          state: u.state,
          country: u.country,
          logoUrl: u.logo_url,
          description: u.description,
          websiteUrl: u.website_url,
          subscription: u.subscription,
          connectedPlatforms
        }
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

// ─── Update Profile ──────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;

    const result = await query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
           last_name  = COALESCE($2, last_name),
           phone      = COALESCE($3, phone),
           updated_at = NOW()
       WHERE id = $4 AND deleted_at IS NULL
       RETURNING id, first_name, last_name, email, phone, role, avatar_url`,
      [firstName || null, lastName || null, phone || null, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar_url
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

// ─── Logout ──────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
};

// ─── Forgot Password ─────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await query(
      `SELECT id, first_name, email, business_id, is_active
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset PIN has been sent.'
      });
    }

    const user = result.rows[0];
    const pin = generatePin();
    const pinHash = hashPin(pin);
    const pinExpires = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
      [pinHash, pinExpires, user.id]
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`\n🔑 DEV — Password reset PIN for ${user.email}: ${pin}\n`);
    }
    sendPasswordResetPinEmail(user.email, user.first_name, pin).catch(err => {
      console.error('Password reset email failed:', err.message);
    });

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset PIN has been sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Failed to process password reset request.' });
  }
};

// ─── Verify Reset PIN ────────────────────────────────────────
exports.verifyResetPin = async (req, res) => {
  try {
    const { email, pin } = req.body;

    const pinHash = hashPin(pin);

    const result = await query(
      `SELECT id FROM users
       WHERE email = $1
         AND password_reset_token = $2
         AND password_reset_expires > NOW()
         AND deleted_at IS NULL
         AND is_active = true`,
      [email, pinHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired PIN.' });
    }

    res.status(200).json({
      success: true,
      message: 'PIN verified successfully.'
    });

  } catch (error) {
    console.error('Verify reset PIN error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify PIN. Please try again.' });
  }
};

// ─── Reset Password ──────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    const result = await query(
      `SELECT id, business_id FROM users
       WHERE email = $1 AND deleted_at IS NULL
       ORDER BY is_active DESC, updated_at DESC
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'User not found.' });
    }

    const user = result.rows[0];
    const passwordHash = await bcryptjs.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    await query(
      `UPDATE users
       SET password_hash = $1,
           is_email_verified = true,
           password_reset_token = NULL,
           password_reset_expires = NULL,
           failed_login_attempts = 0,
           account_locked_until = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password. Please try again.' });
  }
};
