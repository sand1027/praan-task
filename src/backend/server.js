/**
 * Main Backend Server
 * 
 * This is the heart of the backend system.
 * It starts the Express server, connects to MongoDB and MQTT,
 * and initializes all services.
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const logger = require('./utils/logger');
const mqttService = require('./services/mqttService');
const schedulerService = require('./services/schedulerService');
const preCleanService = require('./services/preCleanService');
const { deviceAliasMiddleware } = require('./middleware/deviceAlias');

// Import routes
const scheduleRoutes = require('./routes/scheduleRoutes');
const precleanRoutes = require('./routes/precleanRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const controlRoutes = require('./routes/controlRoutes');
const deviceManagementRoutes = require('./routes/deviceManagementRoutes');
const aliasRoutes = require('./routes/aliasRoutes');

// ============================================
// CONFIGURATION
// ============================================

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/praan-iot';

// ============================================
// EXPRESS APP SETUP
// ============================================

const app = express();

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(deviceAliasMiddleware); // Device alias middleware

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ============================================
// API ROUTES
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      mqtt: mqttService.isConnected ? 'connected' : 'disconnected'
    }
  });
});

// API documentation endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Praan IoT Backend API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      schedule: {
        create: 'POST /api/schedule',
        list: 'GET /api/schedule/:deviceId',
        get: 'GET /api/schedule/detail/:scheduleId',
        update: 'PUT /api/schedule/:scheduleId',
        delete: 'DELETE /api/schedule/:scheduleId'
      },
      preclean: {
        start: 'POST /api/preclean',
        cancel: 'POST /api/preclean/cancel',
        status: 'GET /api/preclean/status/:deviceId'
      },
      control: {
        power: 'POST /api/control/power',
        fan: 'POST /api/control/fan'
      },
      device: {
        data: 'GET /api/device/:deviceId/data',
        latest: 'GET /api/device/:deviceId/latest',
        state: 'GET /api/device/:deviceId/state',
        commands: 'GET /api/device/:deviceId/commands',
        statistics: 'GET /api/device/:deviceId/statistics',
        list: 'GET /api/device/list/all'
      },
      deviceManagement: {
        register: 'POST /api/devices/register',
        list: 'GET /api/devices',
        get: 'GET /api/devices/:deviceId',
        update: 'PUT /api/devices/:deviceId',
        delete: 'DELETE /api/devices/:deviceId',
        active: 'GET /api/devices/status/active'
      },
      alias: {
        current: 'GET /api/alias/current',
        set: 'POST /api/alias/set/:deviceId'
      }
    },
    documentation: 'See README.md for detailed API documentation'
  });
});

// Mount API routes
app.use('/api/schedule', scheduleRoutes);
app.use('/api/preclean', precleanRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/control', controlRoutes);
app.use('/api/devices', deviceManagementRoutes);
app.use('/api/alias', aliasRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// DATABASE CONNECTION
// ============================================

async function connectDatabase() {
  try {
    logger.info('Connecting to MongoDB...');
    logger.info(`MongoDB URI: ${MONGODB_URI}`);
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    logger.info('Successfully connected to MongoDB');
    
    // Handle MongoDB connection events
    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
    
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

// ============================================
// SERVER STARTUP
// ============================================

async function startServer() {
  try {
    logger.info('===========================================');
    logger.info('PRAAN IOT BACKEND SERVER STARTING...');
    logger.info('===========================================');
    
    // Step 1: Connect to MongoDB
    await connectDatabase();
    
    // Step 2: Connect to MQTT broker
    await mqttService.connect();
    
    // Step 3: Initialize scheduler service
    await schedulerService.initialize();
    
    // Step 4: Initialize PreClean service
    await preCleanService.initialize();
    
    // Step 5: Start Express server
    app.listen(PORT, () => {
      logger.info('===========================================');
      logger.info(`Backend server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API URL: http://localhost:${PORT}`);
      logger.info('===========================================');
      logger.info('Server is ready to accept requests');
      logger.info('===========================================\n');
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function gracefulShutdown(signal) {
  logger.info(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Stop scheduler
    schedulerService.stopAll();
    
    // Stop PreClean service
    preCleanService.shutdown();
    
    // Disconnect MQTT
    mqttService.disconnect();
    
    // Close MongoDB connection
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ============================================
// START THE SERVER
// ============================================

startServer();

