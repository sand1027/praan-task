/**
 * Pre-Clean API Routes
 * 
 * PRE-CLEAN DEFINITION:
 * Pre-clean is a temporary fan override feature. It:
 * 1. Saves the CURRENT device state (fan speed and power status) BEFORE starting
 * 2. Sets the device to the requested fan mode for the specified duration
 * 3. After the duration expires, RESTORES the device to the saved previous state
 * 
 * IMPORTANT NOTES:
 * - If the device is already at the requested fan speed, it will restore to that same speed
 * - The previous state is captured at the moment pre-clean starts
 * - If you set fan to 5, then immediately start pre-clean with fan 5, it will restore to 5
 *   (because that was the current state when pre-clean started)
 * 
 * Example:
 * - Current state: Fan speed 2, Power ON
 * - Start pre-clean: Fan speed 5, Duration 10 seconds
 * - After 10 seconds: Restores to Fan speed 2, Power ON
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const preCleanService = require('../services/preCleanService');



/**
 * POST /api/preclean
 * Trigger a temporary fan override
 */
router.post('/', async (req, res) => {
  try {
    const { deviceId, fanMode, minutes, seconds } = req.body;
    
    // Validate required fields
    if (!deviceId || !fanMode || (minutes === undefined && seconds === undefined)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['deviceId', 'fanMode', 'minutes or seconds']
      });
    }
    
    // Validate fan mode
    if (fanMode < 1 || fanMode > 5) {
      return res.status(400).json({
        success: false,
        error: 'Fan mode must be between 1 and 5'
      });
    }
    
    // Calculate total duration in seconds
    const totalSeconds = (minutes || 0) * 60 + (seconds || 0);
    
    // Validate duration
    if (totalSeconds < 1 || totalSeconds > 3600) {
      return res.status(400).json({
        success: false,
        error: 'Duration must be between 1 second and 60 minutes (3600 seconds)'
      });
    }
    
    logger.info('Pre-clean requested:', { deviceId, fanMode, minutes, seconds, totalSeconds });
    
    // Start pre-clean using service
    try {
      const preClean = await preCleanService.startPreClean(deviceId, fanMode, totalSeconds);
      
      res.status(200).json({
        success: true,
        message: 'Pre-clean started successfully',
        data: {
          deviceId,
          fanMode,
          minutes: minutes || 0,
          seconds: seconds || 0,
          totalSeconds,
          previousFanSpeed: preClean.previousState.fanSpeed,
          startedAt: preClean.startedAt,
          willEndAt: preClean.scheduledEndAt,
          status: 'Device will run at requested speed and then return to previous state'
        }
      });
    } catch (serviceError) {
      logger.error('PreClean service error:', serviceError);
      throw serviceError; // Re-throw to be caught by outer catch
    }
    
  } catch (error) {
    logger.error('Error starting pre-clean:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start pre-clean',
      message: error.message
    });
  }
});

/**
 * POST /api/preclean/cancel
 * Cancel an active pre-clean and restore immediately
 */
router.post('/cancel', async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }
    
    logger.info(`Cancelling pre-clean for device ${deviceId}`);
    
    // Check if there are active pre-cleans
    const hasActive = await preCleanService.hasActivePreClean(deviceId);
    
    if (!hasActive) {
      return res.status(404).json({
        success: false,
        error: 'No active pre-clean found for this device'
      });
    }
    
    // Cancel active pre-cleans
    await preCleanService.cancelActivePreCleans(deviceId);
    
    res.json({
      success: true,
      message: 'Pre-clean cancelled successfully',
      data: {
        deviceId
      }
    });
    
  } catch (error) {
    logger.error('Error cancelling pre-clean:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel pre-clean',
      message: error.message
    });
  }
});

/**
 * GET /api/preclean/status/:deviceId
 * Get pre-clean status for a device
 */
router.get('/status/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Get active pre-cleans
    const activePreCleans = await preCleanService.getActivePreCleans(deviceId);
    
    if (activePreCleans.length > 0) {
      const preClean = activePreCleans[0]; // Get the first active one
      const remainingSeconds = Math.ceil((preClean.scheduledEndAt - new Date()) / 1000);
      
      res.json({
        success: true,
        data: {
          deviceId,
          isActive: true,
          startedAt: preClean.startedAt,
          durationSeconds: preClean.duration,
          willEndAt: preClean.scheduledEndAt,
          remainingSeconds,
          previousFanSpeed: preClean.previousState.fanSpeed,
          targetFanSpeed: preClean.targetFanSpeed
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          deviceId,
          isActive: false
        }
      });
    }
    
  } catch (error) {
    logger.error('Error getting pre-clean status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pre-clean status',
      message: error.message
    });
  }
});

/**
 * POST /api/preclean/force-complete/:deviceId
 * Manually force completion of expired pre-cleans (for debugging)
 */
router.post('/force-complete/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const completedCount = await preCleanService.forceCompleteExpired(deviceId);
    
    res.json({
      success: true,
      message: `Completed ${completedCount} expired pre-cleans`,
      data: {
        deviceId,
        completedCount
      }
    });
    
  } catch (error) {
    logger.error('Error force completing pre-cleans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to force complete pre-cleans',
      message: error.message
    });
  }
});

module.exports = router;

