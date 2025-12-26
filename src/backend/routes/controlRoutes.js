/**
 * Device Control API Routes
 * 
 * Direct control endpoints for turning device on/off and setting fan speed
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const mqttService = require('../services/mqttService');
const DeviceState = require('../models/DeviceState');

/**
 * POST /api/control/power
 * Turn device on or off
 * 
 * Request Body:
 * {
 *   "deviceId": "AIR_PURIFIER_001",
 *   "powerOn": true
 * }
 */
router.post('/power', async (req, res) => {
  try {
    const { deviceId, powerOn } = req.body;
    
    // Validate required fields
    if (!deviceId || powerOn === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['deviceId', 'powerOn']
      });
    }
    
    logger.info(`Power control requested for ${deviceId}: ${powerOn ? 'ON' : 'OFF'}`);
    
    // Get current device state
    const deviceState = await DeviceState.findOne({ deviceId });
    
    if (!deviceState) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Send command
    if (powerOn) {
      // Turn on - restore to last saved fan speed, or default to 2 if never set
      const fanSpeed = deviceState.lastFanSpeedBeforeOff && deviceState.lastFanSpeedBeforeOff > 0 
        ? deviceState.lastFanSpeedBeforeOff 
        : 2;
      
      logger.info(`Turning device ON - restoring to fan speed: ${fanSpeed}`);
      
      // Send command (non-blocking)
      mqttService.sendCommand(deviceId, 'setFanSpeed', fanSpeed, 'control')
        .then(() => {
          logger.info(`Turn ON command sent and acknowledged for device ${deviceId}`);
        })
        .catch((error) => {
          logger.error(`Error sending turn ON command:`, error);
        });
      
      res.json({
        success: true,
        message: 'Device turned ON',
        data: {
          deviceId,
          powerOn: true,
          fanSpeed,
          restoredFromLastState: deviceState.lastFanSpeedBeforeOff && deviceState.lastFanSpeedBeforeOff > 0
        }
      });
    } else {
      // Turn off - save current fan speed before turning off
      // Prefer currentFanSpeed if available, otherwise keep existing lastFanSpeedBeforeOff
      if (deviceState.currentFanSpeed > 0) {
        deviceState.lastFanSpeedBeforeOff = deviceState.currentFanSpeed;
        await deviceState.save();
        logger.info(`Saving current fan speed before turning off: ${deviceState.currentFanSpeed}`);
      } else if (deviceState.lastFanSpeedBeforeOff && deviceState.lastFanSpeedBeforeOff > 0) {
        logger.info(`Using previously saved fan speed: ${deviceState.lastFanSpeedBeforeOff}`);
      }
      
      // Send command (non-blocking)
      mqttService.sendCommand(deviceId, 'turnOff', 0, 'control')
        .then(() => {
          logger.info(`Turn OFF command sent and acknowledged for device ${deviceId}`);
        })
        .catch((error) => {
          logger.error(`Error sending turn OFF command:`, error);
        });
      
      res.json({
        success: true,
        message: 'Device turned OFF',
        data: {
          deviceId,
          powerOn: false,
          fanSpeed: 0,
          lastFanSpeed: deviceState.lastFanSpeedBeforeOff || null
        }
      });
    }
    
  } catch (error) {
    logger.error('Error controlling device power:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to control device power',
      message: error.message
    });
  }
});

/**
 * POST /api/control/fan
 * Set fan speed (also turns device on)
 * 
 * Request Body:
 * {
 *   "deviceId": "AIR_PURIFIER_001",
 *   "fanSpeed": 3
 * }
 */
router.post('/fan', async (req, res) => {
  try {
    const { deviceId, fanSpeed } = req.body;
    
    // Validate required fields
    if (!deviceId || !fanSpeed) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['deviceId', 'fanSpeed']
      });
    }
    
    // Validate fan speed
    if (fanSpeed < 1 || fanSpeed > 5) {
      return res.status(400).json({
        success: false,
        error: 'Fan speed must be between 1 and 5'
      });
    }
    
    logger.info(`Fan speed control requested for ${deviceId}: ${fanSpeed}`);
    
    // Get current device state
    const deviceState = await DeviceState.findOne({ deviceId });
    
    if (!deviceState) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Save this fan speed as the last one (for restore when turning on)
    deviceState.lastFanSpeedBeforeOff = fanSpeed;
    await deviceState.save();
    logger.info(`Saving fan speed ${fanSpeed} for future restore`);
    
    // Send command (non-blocking)
    mqttService.sendCommand(deviceId, 'setFanSpeed', fanSpeed, 'control')
      .then(() => {
        logger.info(`Fan speed command sent and acknowledged for device ${deviceId}`);
      })
      .catch((error) => {
        logger.error(`Error sending fan speed command:`, error);
      });
    
    res.json({
      success: true,
      message: `Fan speed set to ${fanSpeed}`,
      data: {
        deviceId,
        fanSpeed,
        powerOn: true
      }
    });
    
  } catch (error) {
    logger.error('Error setting fan speed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set fan speed',
      message: error.message
    });
  }
});

module.exports = router;

