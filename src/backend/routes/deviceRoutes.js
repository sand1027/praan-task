/**
 * Device API Routes
 * 
 * These endpoints provide information about devices and their sensor data.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const SensorData = require('../models/SensorData');
const DeviceState = require('../models/DeviceState');
const CommandLog = require('../models/CommandLog');

/**
 * GET /api/device/:deviceId/data
 * Get sensor data for a device
 * 
 * Query Parameters:
 * - limit: Number of records to return (default: 100)
 * - startDate: Start date for filtering (ISO format)
 * - endDate: End date for filtering (ISO format)
 */
router.get('/:deviceId/data', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 100, startDate, endDate } = req.query;
    
    logger.info(`Fetching sensor data for device: ${deviceId}`);
    
    // Build query
    const query = { deviceId };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    // Fetch sensor data
    const sensorData = await SensorData.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      count: sensorData.length,
      data: sensorData
    });
    
  } catch (error) {
    logger.error('Error fetching sensor data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sensor data',
      message: error.message
    });
  }
});

/**
 * GET /api/device/:deviceId/latest
 * Get latest sensor reading for a device
 */
router.get('/:deviceId/latest', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    logger.info(`Fetching latest sensor data for device: ${deviceId}`);
    
    const latestData = await SensorData.findOne({ deviceId })
      .sort({ timestamp: -1 });
    
    if (!latestData) {
      return res.status(404).json({
        success: false,
        error: 'No data found for this device'
      });
    }
    
    res.json({
      success: true,
      data: latestData
    });
    
  } catch (error) {
    logger.error('Error fetching latest sensor data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch latest sensor data',
      message: error.message
    });
  }
});

/**
 * GET /api/device/:deviceId/state
 * Get current state of a device
 */
router.get('/:deviceId/state', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    logger.info(`Fetching state for device: ${deviceId}`);
    
    const deviceState = await DeviceState.findOne({ deviceId });
    
    if (!deviceState) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    res.json({
      success: true,
      data: deviceState
    });
    
  } catch (error) {
    logger.error('Error fetching device state:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device state',
      message: error.message
    });
  }
});

/**
 * GET /api/device/:deviceId/commands
 * Get command history for a device
 */
router.get('/:deviceId/commands', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 50 } = req.query;
    
    logger.info(`Fetching command history for device: ${deviceId}`);
    
    const commands = await CommandLog.find({ deviceId })
      .sort({ sentAt: -1 })
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      count: commands.length,
      data: commands
    });
    
  } catch (error) {
    logger.error('Error fetching command history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch command history',
      message: error.message
    });
  }
});

/**
 * GET /api/device/:deviceId/statistics
 * Get statistics for a device
 */
router.get('/:deviceId/statistics', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { hours = 24 } = req.query;
    
    logger.info(`Fetching statistics for device: ${deviceId}`);
    
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const sensorData = await SensorData.find({
      deviceId,
      timestamp: { $gte: startDate }
    });
    
    if (sensorData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data found for this time period'
      });
    }
    
    // Calculate statistics
    const stats = {
      temperature: {
        min: Math.min(...sensorData.map(d => d.temperature)),
        max: Math.max(...sensorData.map(d => d.temperature)),
        avg: sensorData.reduce((sum, d) => sum + d.temperature, 0) / sensorData.length
      },
      humidity: {
        min: Math.min(...sensorData.map(d => d.humidity)),
        max: Math.max(...sensorData.map(d => d.humidity)),
        avg: sensorData.reduce((sum, d) => sum + d.humidity, 0) / sensorData.length
      },
      pm25: {
        min: Math.min(...sensorData.map(d => d.pm25)),
        max: Math.max(...sensorData.map(d => d.pm25)),
        avg: sensorData.reduce((sum, d) => sum + d.pm25, 0) / sensorData.length
      },
      dataPoints: sensorData.length,
      timeRange: {
        start: startDate,
        end: new Date()
      }
    };
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    logger.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/device/list
 * Get list of all devices
 */
router.get('/list/all', async (req, res) => {
  try {
    logger.info('Fetching all devices');
    
    const devices = await DeviceState.find({});
    
    res.json({
      success: true,
      count: devices.length,
      data: devices
    });
    
  } catch (error) {
    logger.error('Error fetching devices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch devices',
      message: error.message
    });
  }
});

module.exports = router;

