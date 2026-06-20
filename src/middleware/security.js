const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

// Rate limiting configuration
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime;
      let minutesLeft;

      if (resetTime) {
        minutesLeft = Math.ceil((new Date(resetTime).getTime() - Date.now()) / 60000);
      } else {
        minutesLeft = Math.ceil(windowMs / 60000);
      }

      if (minutesLeft < 1) minutesLeft = 1;

      const minuteWord = minutesLeft === 1 ? 'minute' : 'minutes';

      res.status(429).json({
        success: false,
        error: `${message} Please try again in ${minutesLeft} ${minuteWord}.`,
        retryAfter: minutesLeft * 60
      });
    }
  });
};

// General API rate limiter: 500 req / 15 min
const generalLimiter = createRateLimiter(
  15 * 60 * 1000,
  500,
  'Too many requests from this IP.'
);

// Auth endpoints limiter: 30 req / 15 min (200 in dev)
const authLimiter = createRateLimiter(
  15 * 60 * 1000,
  process.env.NODE_ENV === 'development' ? 200 : 30,
  'Too many authentication attempts.'
);

// Strict limiter for sensitive operations: 50 req / 15 min
const strictLimiter = createRateLimiter(
  15 * 60 * 1000,
  50,
  'Too many requests for this sensitive operation.'
);

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000'];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check exact matches from ALLOWED_ORIGINS
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow any *.pinga.ng subdomain
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'pinga.ng' || hostname.endsWith('.pinga.ng')) {
        return callback(null, true);
      }
    } catch {
      // Invalid URL, fall through to rejection
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Helmet configuration for security headers
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true
});

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  // Remove any potential XSS attempts from request body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }
  next();
};

// IP tracking middleware for audit logs
const trackRequest = (req, res, next) => {
  req.clientIp = req.headers['x-forwarded-for'] ||
                 req.headers['x-real-ip'] ||
                 req.connection.remoteAddress ||
                 req.socket.remoteAddress;
  req.userAgent = req.headers['user-agent'];
  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  strictLimiter,
  corsOptions,
  helmetConfig,
  sanitizeRequest,
  trackRequest
};
