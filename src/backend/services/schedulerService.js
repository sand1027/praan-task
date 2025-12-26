/**
 * Scheduler Service
 * 
 * This manages recurring schedules using cron jobs.
 * Think of it as an alarm clock system that triggers commands at specific times.
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const Schedule = require('../models/Schedule');
const DeviceState = require('../models/DeviceState');
const mqttService = require('./mqttService');

class SchedulerService {
  constructor() {
    // Store active cron jobs
    // Map structure: scheduleId -> cronJob
    this.activeJobs = new Map();
  }
  
  /**
   * Initialize scheduler by loading all active schedules from database
   */
  async initialize() {
    try {
      logger.info('Initializing scheduler service...');
      
      // Load all active schedules from database
      const schedules = await Schedule.find({ isActive: true });
      
      logger.info(`Found ${schedules.length} active schedules`);
      
      // Create cron jobs for each schedule
      for (const schedule of schedules) {
        this.createCronJob(schedule);
      }
      
      logger.info('Scheduler service initialized successfully');
    } catch (error) {
      logger.error('Error initializing scheduler service:', error);
      throw error;
    }
  }
  
  /**
   * Create a cron job for a schedule
   * 
   * @param {Object} schedule - Schedule document from MongoDB
   */
  createCronJob(schedule) {
    try {
      const { _id, deviceId, day, startTime, endTime, fanSpeed } = schedule;
      
      // Convert day name to cron day number (0 = Sunday, 1 = Monday, etc.)
      const dayMap = {
        'Sunday': 0,
        'Monday': 1,
        'Tuesday': 2,
        'Wednesday': 3,
        'Thursday': 4,
        'Friday': 5,
        'Saturday': 6
      };
      
      const cronDay = dayMap[day];
      
      // Parse start time (HH:MM)
      const [startHour, startMinute] = startTime.split(':');
      
      // Parse end time (HH:MM)
      const [endHour, endMinute] = endTime.split(':');
      
      // Create cron expression for start time
      // Format: "minute hour * * day"
      // Example: "0 9 * * 1" = Every Monday at 9:00 AM
      const startCronExpression = `${startMinute} ${startHour} * * ${cronDay}`;
      
      // Create cron expression for end time
      const endCronExpression = `${endMinute} ${endHour} * * ${cronDay}`;
      
      logger.info(`Creating cron job for schedule ${_id}`);
      logger.info(`  Device: ${deviceId}`);
      logger.info(`  Day: ${day}`);
      logger.info(`  Start: ${startTime} (cron: ${startCronExpression})`);
      logger.info(`  End: ${endTime} (cron: ${endCronExpression})`);
      logger.info(`  Fan Speed: ${fanSpeed}`);
      
      // Create start cron job
      const startJob = cron.schedule(startCronExpression, async () => {
        // Double-check that today is the correct day (timezone-aware)
        const now = new Date();
        const timezone = process.env.TIMEZONE || 'UTC';
        const currentDay = now.toLocaleString('en-US', { timeZone: timezone, weekday: 'long' });
        
        if (currentDay !== day) {
          logger.warn(`Schedule ${_id} triggered but today is ${currentDay}, not ${day}. Skipping execution.`);
          return;
        }
        
        logger.info(`Executing start schedule ${_id} for device ${deviceId}`);
        logger.info(`Current time in ${timezone}: ${now.toLocaleString('en-US', { timeZone: timezone })}`);
        
        try {
          // Get or create device state
          let deviceState = await DeviceState.findOne({ deviceId });
          if (!deviceState) {
            deviceState = new DeviceState({
              deviceId,
              currentFanSpeed: 0,
              powerOn: false,
              isOnline: false
            });
          }
          
          // If this is the first schedule starting, save the original state
          if (!deviceState.scheduleState || deviceState.scheduleState.activeScheduleCount === 0) {
            // Initialize state stack if needed
            if (!deviceState.stateStack) {
              deviceState.stateStack = [];
            }
            
            // Push current state to stack before schedule starts
            deviceState.stateStack.push({
              fanSpeed: deviceState.currentFanSpeed,
              powerOn: deviceState.powerOn,
              timestamp: new Date(),
              operation: 'schedule',
              operationId: _id.toString()
            });
            
            logger.info(`First schedule starting - pushed current state to stack: Fan Speed: ${deviceState.currentFanSpeed}, Power: ${deviceState.powerOn}`);
            deviceState.scheduleState = {
              originalFanSpeed: deviceState.currentFanSpeed,
              originalPowerOn: deviceState.powerOn,
              activeScheduleCount: 1
            };
          } else {
            // Another schedule is already active, just increment the count
            logger.info(`Additional schedule starting - active schedules: ${deviceState.scheduleState.activeScheduleCount + 1}`);
            deviceState.scheduleState.activeScheduleCount += 1;
          }
          await deviceState.save();
          
          // Send command to set fan speed
          await mqttService.sendCommand(deviceId, 'setFanSpeed', fanSpeed, 'schedule');
          
          // Update schedule execution history
          await Schedule.findByIdAndUpdate(_id, {
            lastExecuted: new Date(),
            $push: {
              executionHistory: {
                executedAt: new Date(),
                status: 'success',
                message: `Fan speed set to ${fanSpeed}`,
                retryCount: 0
              }
            }
          });
          
          logger.info(`Schedule ${_id} executed successfully`);
        } catch (error) {
          logger.error(`Error executing schedule ${_id}:`, error);
          
          // Update schedule execution history with error
          await Schedule.findByIdAndUpdate(_id, {
            $push: {
              executionHistory: {
                executedAt: new Date(),
                status: 'failed',
                message: error.message,
                retryCount: 0
              }
            }
          });
        }
      }, {
        scheduled: true,
        timezone: process.env.TIMEZONE || 'UTC'
      });
      
      // Create end cron job
      const endJob = cron.schedule(endCronExpression, async () => {
        console.log(`[END CRON] End job triggered for schedule ${_id} at ${new Date().toISOString()}`);
        
        // Double-check that today is the correct day (timezone-aware)
        const now = new Date();
        const timezone = process.env.TIMEZONE || 'UTC';
        const currentDay = now.toLocaleString('en-US', { timeZone: timezone, weekday: 'long' });
        
        console.log(`[END CRON] Current day: ${currentDay}, Expected day: ${day}`);
        
        if (currentDay !== day) {
          logger.warn(`End schedule ${_id} triggered but today is ${currentDay}, not ${day}. Skipping execution.`);
          return;
        }
        
        logger.info(`Executing end schedule ${_id} for device ${deviceId}`);
        logger.info(`Current time in ${timezone}: ${now.toLocaleString('en-US', { timeZone: timezone })}`);
        
        try {
          // Always turn off device when schedule ends (simplified logic)
          logger.info(`Schedule ${_id} ended - turning off device`);
          await mqttService.sendCommand(deviceId, 'turnOff', 0, 'schedule');
          
          logger.info(`End schedule ${_id} executed successfully`);
        } catch (error) {
          logger.error(`Error executing end schedule ${_id}:`, error);
        }
      }, {
        scheduled: true,
        timezone: process.env.TIMEZONE || 'UTC'
      });
      
      // Store jobs in map
      this.activeJobs.set(`${_id}_start`, startJob);
      this.activeJobs.set(`${_id}_end`, endJob);
      
      logger.info(`Cron jobs created for schedule ${_id}`);
      
    } catch (error) {
      logger.error(`Error creating cron job for schedule ${schedule._id}:`, error);
      throw error;
    }
  }
  
  /**
   * Add a new schedule and create its cron job
   * 
   * @param {Object} scheduleData - Schedule data
   * @returns {Promise<Object>} Created schedule
   */
  async addSchedule(scheduleData) {
    try {
      // Create schedule in database
      const schedule = new Schedule(scheduleData);
      await schedule.save();
      
      logger.info(`Schedule created: ${schedule._id}`);
      
      // Create cron job for this schedule
      this.createCronJob(schedule);
      
      return schedule;
    } catch (error) {
      logger.error('Error adding schedule:', error);
      throw error;
    }
  }
  
  /**
   * Remove a schedule and stop its cron job
   * 
   * @param {string} scheduleId - Schedule ID
   */
  async removeSchedule(scheduleId) {
    try {
      // Get schedule info before deletion
      const schedule = await Schedule.findById(scheduleId);
      if (!schedule) {
        throw new Error('Schedule not found');
      }
      
      const { deviceId } = schedule;
      
      // Stop and remove cron jobs
      const startJobKey = `${scheduleId}_start`;
      const endJobKey = `${scheduleId}_end`;
      
      if (this.activeJobs.has(startJobKey)) {
        this.activeJobs.get(startJobKey).stop();
        this.activeJobs.delete(startJobKey);
      }
      
      if (this.activeJobs.has(endJobKey)) {
        this.activeJobs.get(endJobKey).stop();
        this.activeJobs.delete(endJobKey);
      }
      
      // Check if this schedule was currently active and restore state
      const deviceState = await DeviceState.findOne({ deviceId });
      if (deviceState?.scheduleState?.activeScheduleCount > 0) {
        // Check if this schedule is currently running (within its time window)
        const now = new Date();
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
        const currentTime = now.toTimeString().slice(0, 5);
        
        const isCurrentlyActive = (
          schedule.day === currentDay &&
          currentTime >= schedule.startTime &&
          currentTime <= schedule.endTime
        );
        
        if (isCurrentlyActive) {
          deviceState.scheduleState.activeScheduleCount = Math.max(0, deviceState.scheduleState.activeScheduleCount - 1);
          
          // If this was the last active schedule, turn off device
          if (deviceState.scheduleState.activeScheduleCount === 0) {
            logger.info(`Last active schedule deleted - turning off device`);
            await mqttService.sendCommand(deviceId, 'turnOff', 0, 'schedule');
            
            deviceState.scheduleState = {
              originalFanSpeed: null,
              originalPowerOn: null,
              activeScheduleCount: 0
            };
          }
          
          await deviceState.save();
        }
      }
      
      // Delete schedule from database
      await Schedule.findByIdAndDelete(scheduleId);
      
      logger.info(`Schedule ${scheduleId} removed and state restored`);
    } catch (error) {
      logger.error('Error removing schedule:', error);
      throw error;
    }
  }
  
  /**
   * Update a schedule
   * 
   * @param {string} scheduleId - Schedule ID
   * @param {Object} updateData - Updated schedule data
   */
  async updateSchedule(scheduleId, updateData) {
    try {
      // Remove old cron jobs
      await this.removeSchedule(scheduleId);
      
      // Update schedule in database
      const schedule = await Schedule.findByIdAndUpdate(
        scheduleId,
        updateData,
        { new: true }
      );
      
      if (!schedule) {
        throw new Error('Schedule not found');
      }
      
      // Create new cron jobs
      this.createCronJob(schedule);
      
      logger.info(`Schedule ${scheduleId} updated`);
      
      return schedule;
    } catch (error) {
      logger.error('Error updating schedule:', error);
      throw error;
    }
  }
  
  /**
   * Get all schedules for a device
   * 
   * @param {string} deviceId - Device ID
   * @returns {Promise<Array>} List of schedules
   */
  async getSchedules(deviceId) {
    try {
      const schedules = await Schedule.find({ deviceId, isActive: true });
      return schedules;
    } catch (error) {
      logger.error('Error getting schedules:', error);
      throw error;
    }
  }
  
  /**
   * Stop all cron jobs (for graceful shutdown)
   */
  stopAll() {
    logger.info('Stopping all cron jobs...');
    
    for (const [key, job] of this.activeJobs) {
      job.stop();
      logger.info(`Stopped cron job: ${key}`);
    }
    
    this.activeJobs.clear();
    logger.info('All cron jobs stopped');
  }
}

// Export singleton instance
module.exports = new SchedulerService();

