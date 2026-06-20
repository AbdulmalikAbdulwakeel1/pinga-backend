require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server: SocketServer } = require('socket.io');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { pool } = require('./config/database');
const {
  generalLimiter,
  corsOptions,
  helmetConfig,
  sanitizeRequest,
  trackRequest
} = require('./middleware/security');

// Import routes
const authRoutes = require('./routes/auth.routes');
const conversationRoutes = require('./routes/conversation.routes');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const leadRoutes = require('./routes/lead.routes');
const orderRoutes = require('./routes/order.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const aiAgentRoutes = require('./routes/ai-agent.routes');
const teamRoutes = require('./routes/team.routes');
const notificationRoutes = require('./routes/notification.routes');
const broadcastRoutes = require('./routes/broadcast.routes');
const activityRoutes = require('./routes/activity.routes');
const integrationRoutes = require('./routes/integration.routes');
const webhookRoutes = require('./routes/webhook.routes');
const uploadRoutes = require('./routes/upload.routes');

const app = express();
const httpServer = http.createServer(app);

// Socket.io for real-time conversation updates
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000'],
    credentials: true,
  }
});

// Make io accessible in routes/controllers and via singleton
app.set('io', io);
const { setIo } = require('./utils/socket');
setIo(io);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join a business room (for broadcast updates to all agents in a business)
  socket.on('join:business', (businessId) => {
    socket.join(`business:${businessId}`);
    console.log(`Socket ${socket.id} joined business:${businessId}`);
  });

  // Join a specific conversation room
  socket.on('join:conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
    console.log(`Socket ${socket.id} joined conversation:${conversationId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

app.set('trust proxy', 1);

// Security middleware
app.use(helmetConfig);
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Custom middleware
app.use(sanitizeRequest);
app.use(trackRequest);
app.use(generalLimiter);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pinga API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

const API_VERSION = process.env.API_VERSION || 'v1';

// Routes
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/conversations`, conversationRoutes);
app.use(`/api/${API_VERSION}/products`, productRoutes);
app.use(`/api/${API_VERSION}/categories`, categoryRoutes);
app.use(`/api/${API_VERSION}/leads`, leadRoutes);
app.use(`/api/${API_VERSION}/orders`, orderRoutes);
app.use(`/api/${API_VERSION}/analytics`, analyticsRoutes);
app.use(`/api/${API_VERSION}/ai-agent`, aiAgentRoutes);
app.use(`/api/${API_VERSION}/team`, teamRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);
app.use(`/api/${API_VERSION}/broadcasts`, broadcastRoutes);
app.use(`/api/${API_VERSION}/activity`, activityRoutes);
app.use(`/api/${API_VERSION}/integrations`, integrationRoutes);
app.use(`/api/${API_VERSION}/webhooks`, webhookRoutes);
app.use(`/api/${API_VERSION}/upload`, uploadRoutes);

// Welcome
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Pinga API - AI Social Sales Agent',
    version: API_VERSION,
    endpoints: {
      health: '/health',
      auth: `/api/${API_VERSION}/auth`,
      conversations: `/api/${API_VERSION}/conversations`,
      products: `/api/${API_VERSION}/products`,
      categories: `/api/${API_VERSION}/categories`,
      leads: `/api/${API_VERSION}/leads`,
      orders: `/api/${API_VERSION}/orders`,
      analytics: `/api/${API_VERSION}/analytics`,
      aiAgent: `/api/${API_VERSION}/ai-agent`,
      team: `/api/${API_VERSION}/team`,
      notifications: `/api/${API_VERSION}/notifications`,
      broadcasts: `/api/${API_VERSION}/broadcasts`,
      activity: `/api/${API_VERSION}/activity`,
      integrations: `/api/${API_VERSION}/integrations`,
      webhooks: `/api/${API_VERSION}/webhooks`
    }
  });
});

// 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Route ${req.originalUrl} does not exist`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, error: 'Validation error', details: err.message });
  }
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.status(err.statusCode || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');

    httpServer.listen(PORT, () => {
      console.log('');
      console.log('🚀 ══════════════════════════════════════════');
      console.log('   Pinga Backend - AI Social Sales Agent');
      console.log('   ══════════════════════════════════════════');
      console.log(`   🌍 Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   🔌 Port        : ${PORT}`);
      console.log(`   🔗 URL         : http://localhost:${PORT}`);
      console.log(`   📡 API Base    : http://localhost:${PORT}/api/${API_VERSION}`);
      console.log('   ══════════════════════════════════════════');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

startServer();
module.exports = app;
