/**
 * Schedule API Routes
 * 
 * These are the endpoints for managing device schedules.
 * Like a remote control interface for setting up automatic timers.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const schedulerService = require('../services/schedulerService');
const Schedule = require('../models/Schedule');
const mqttService = require('../services/mqttService');

/**
 * POST /api/schedule
 * Create a new recurring schedule
 * 
 * Request Body:
 * {
 *   "deviceId": "AIR_PURIFIER_001",
 *   "day": "Monday",
 *   "startTime": "09:00",
 *   "endTime": "17:00",
 *   "fanSpeed": 3
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { deviceId, recurrenceType = 'weekly', day, days, interval = 1, customCron, startTime, endTime, fanSpeed } = req.body;
    
    // Validate required fields
    if (!deviceId || !startTime || !endTime || !fanSpeed) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['deviceId', 'startTime', 'endTime', 'fanSpeed']
      });
    }
    
    // Validate recurrence type
    const validRecurrenceTypes = ['daily', 'weekly', 'monthly', 'custom'];
    if (!validRecurrenceTypes.includes(recurrenceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recurrence type',
        validTypes: validRecurrenceTypes
      });
    }
    
    // Validate based on recurrence type
    if (recurrenceType === 'weekly' && !day && (!days || days.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Weekly recurrence requires either day or days array'
      });
    }
    
    if (recurrenceType === 'custom' && !customCron) {
      return res.status(400).json({
        success: false,
        error: 'Custom recurrence requires customCron expression'
      });
    }
    
    // Validate day/days
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (day && !validDays.includes(day)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid day',
        validDays
      });
    }
    
    if (days && days.some(d => !validDays.includes(d))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid day in days array',
        validDays
      });
    }
    
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time format. Use HH:MM (e.g., 09:00)'
      });
    }
    
    // Validate fan speed
    if (fanSpeed < 1 || fanSpeed > 5) {
      return res.status(400).json({
        success: false,
        error: 'Fan speed must be between 1 and 5'
      });
    }
    
    // Validate that end time is after start time
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    if (endMinutes <= startMinutes) {
      return res.status(400).json({
        success: false,
        error: 'End time must be after start time'
      });
    }
    
    logger.info('Creating new schedule:', { deviceId, recurrenceType, day, days, interval, startTime, endTime, fanSpeed });
    
    // Create schedule using scheduler service
    const schedule = await schedulerService.addSchedule({
      deviceId,
      recurrenceType,
      day,
      days,
      interval,
      customCron,
      startTime,
      endTime,
      fanSpeed,
      isActive: true
    });
    
    res.status(201).json({
      success: true,
      message: 'Schedule created successfully',
      data: {
        scheduleId: schedule._id,
        deviceId: schedule.deviceId,
        day: schedule.day,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        fanSpeed: schedule.fanSpeed,
        isActive: schedule.isActive,
        createdAt: schedule.createdAt
      }
    });
    
  } catch (error) {
    logger.error('Error creating schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create schedule',
      message: error.message
    });
  }
});

/**
 * GET /api/schedule/:deviceId
 * Get all schedules for a device
 */
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    logger.info(`Fetching schedules for device: ${deviceId}`);
    
    const schedules = await schedulerService.getSchedules(deviceId);
    
    res.json({
      success: true,
      count: schedules.length,
      data: schedules
    });
    
  } catch (error) {
    logger.error('Error fetching schedules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedules',
      message: error.message
    });
  }
});

/**
 * GET /api/schedule/detail/:scheduleId
 * Get a specific schedule by ID
 */
router.get('/detail/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    
    logger.info(`Fetching schedule: ${scheduleId}`);
    
    const schedule = await Schedule.findById(scheduleId);
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }
    
    res.json({
      success: true,
      data: schedule
    });
    
  } catch (error) {
    logger.error('Error fetching schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule',
      message: error.message
    });
  }
});

/**
 * PUT /api/schedule/:scheduleId
 * Update a schedule
 */
router.put('/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const updateData = req.body;
    
    logger.info(`Updating schedule: ${scheduleId}`);
    
    const schedule = await schedulerService.updateSchedule(scheduleId, updateData);
    
    res.json({
      success: true,
      message: 'Schedule updated successfully',
      data: schedule
    });
    
  } catch (error) {
    logger.error('Error updating schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update schedule',
      message: error.message
    });
  }
});

/**
 * DELETE /api/schedule/:scheduleId
 * Delete a schedule
 */
router.delete('/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    
    logger.info(`Deleting schedule: ${scheduleId}`);
    
    await schedulerService.removeSchedule(scheduleId);
    
    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
    
  } catch (error) {
    logger.error('Error deleting schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete schedule',
      message: error.message
    });
  }
});

/**
 * POST /api/schedule/:scheduleId/test
 * Manually trigger a schedule immediately (for testing)
 */
router.post('/:scheduleId/test', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    
    const schedule = await Schedule.findById(scheduleId);
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }
    
    if (!schedule.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Schedule is not active'
      });
    }
    
    logger.info(`Manually triggering schedule ${scheduleId} for testing`);
    
    // Send start command (set fan speed)
    try {
      await mqttService.sendCommand(schedule.deviceId, 'setFanSpeed', schedule.fanSpeed, 'schedule');
      
      res.json({
        success: true,
        message: 'Schedule triggered successfully (start command sent)',
        data: {
          scheduleId: schedule._id,
          deviceId: schedule.deviceId,
          action: 'start',
          fanSpeed: schedule.fanSpeed,
          note: 'This is a manual test trigger. The actual schedule will still run at the scheduled time.'
        }
      });
    } catch (error) {
      logger.error('Error triggering schedule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to trigger schedule',
        message: error.message
      });
    }
    
  } catch (error) {
    logger.error('Error in test schedule endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test schedule',
      message: error.message
    });
  }
});

module.exports = router;

