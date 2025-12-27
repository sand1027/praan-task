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
   * Create a cron job for a schedule with enhanced recurrence patterns
   */
  createCronJob(schedule) {
    try {
      const { _id, deviceId, recurrenceType, day, days, interval, customCron, startTime, endTime, fanSpeed } = schedule;
      
      logger.info(`Creating cron job for schedule ${_id}`);
      logger.info(`  Device: ${deviceId}`);
      logger.info(`  Recurrence: ${recurrenceType}`);
      logger.info(`  Interval: ${interval}`);
      
      let startCronExpressions = [];
      let endCronExpressions = [];
      
      // Parse start and end times
      const [startHour, startMinute] = startTime.split(':');
      const [endHour, endMinute] = endTime.split(':');
      
      // Generate cron expressions based on recurrence type
      switch (recurrenceType) {
        case 'daily':
          if (interval === 1) {
            // Every day
            startCronExpressions.push(`${startMinute} ${startHour} * * *`);
            endCronExpressions.push(`${endMinute} ${endHour} * * *`);
          } else {
            // Every N days - use custom logic with date checking
            startCronExpressions.push(`${startMinute} ${startHour} */${interval} * *`);
            endCronExpressions.push(`${endMinute} ${endHour} */${interval} * *`);
          }
          break;
          
        case 'weekly':
          const dayMap = {
            'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
            'Thursday': 4, 'Friday': 5, 'Saturday': 6
          };
          
          if (day) {
            // Single day weekly
            const cronDay = dayMap[day];
            if (interval === 1) {
              startCronExpressions.push(`${startMinute} ${startHour} * * ${cronDay}`);
              endCronExpressions.push(`${endMinute} ${endHour} * * ${cronDay}`);
            } else {
              // Every N weeks - need custom handling
              startCronExpressions.push(`${startMinute} ${startHour} * * ${cronDay}`);
              endCronExpressions.push(`${endMinute} ${endHour} * * ${cronDay}`);
            }
          } else if (days && days.length > 0) {
            // Multiple days weekly
            const cronDays = days.map(d => dayMap[d]).join(',');
            startCronExpressions.push(`${startMinute} ${startHour} * * ${cronDays}`);
            endCronExpressions.push(`${endMinute} ${endHour} * * ${cronDays}`);
          }
          break;
          
        case 'monthly':
          // First occurrence of the day in each month
          if (day) {
            const cronDay = dayMap[day];
            startCronExpressions.push(`${startMinute} ${startHour} 1-7 * ${cronDay}`);
            endCronExpressions.push(`${endMinute} ${endHour} 1-7 * ${cronDay}`);
          }
          break;
          
        case 'custom':
          if (customCron) {
            // Use provided cron expression
            const baseCron = customCron.split(' ');
            if (baseCron.length >= 5) {
              baseCron[0] = startMinute; // Override minute
              baseCron[1] = startHour;   // Override hour
              startCronExpressions.push(baseCron.join(' '));
              
              baseCron[0] = endMinute;
              baseCron[1] = endHour;
              endCronExpressions.push(baseCron.join(' '));
            }
          }
          break;
      }
      
      logger.info(`  Start cron: ${startCronExpressions}`);
      logger.info(`  End cron: ${endCronExpressions}`);
      
      // Create start jobs
      startCronExpressions.forEach((cronExpr, index) => {
        const startJob = cron.schedule(cronExpr, async () => {
          await this.executeScheduleStart(_id, deviceId, fanSpeed, recurrenceType, interval);
        }, {
          scheduled: true,
          timezone: process.env.TIMEZONE || 'UTC'
        });
        
        this.activeJobs.set(`${_id}_start_${index}`, startJob);
      });
      
      // Create end jobs
      endCronExpressions.forEach((cronExpr, index) => {
        const endJob = cron.schedule(cronExpr, async () => {
          await this.executeScheduleEnd(_id, deviceId, recurrenceType, interval);
        }, {
          scheduled: true,
          timezone: process.env.TIMEZONE || 'UTC'
        });
        
        this.activeJobs.set(`${_id}_end_${index}`, endJob);
      });
      
      logger.info(`Cron jobs created for schedule ${_id}`);
      
    } catch (error) {
      logger.error(`Error creating cron job for schedule ${schedule._id}:`, error);
      throw error;
    }
  }
  
  /**
   * Execute schedule start with multiple schedule coordination
   */
  async executeScheduleStart(scheduleId, deviceId, fanSpeed, recurrenceType, interval) {
    if (interval > 1 && recurrenceType !== 'custom') {
      const schedule = await Schedule.findById(scheduleId);
      if (schedule && schedule.lastExecuted) {
        const daysSinceLastExecution = Math.floor((new Date() - schedule.lastExecuted) / (1000 * 60 * 60 * 24));
        
        if (recurrenceType === 'daily' && daysSinceLastExecution < interval) {
          return;
        }
        if (recurrenceType === 'weekly' && daysSinceLastExecution < (interval * 7)) {
          return;
        }
      }
    }
    
    try {
      // Check for overlapping schedules
      const currentTime = new Date();
      const activeSchedules = await this.getActiveSchedulesAtTime(deviceId, currentTime);
      
      console.log(`[SCHEDULE] ${activeSchedules.length} schedules active at ${currentTime.toTimeString().slice(0,8)}`);
      
      if (activeSchedules.length > 1) {
        // Multiple schedules - use priority logic (highest fan speed wins)
        const highestSpeedSchedule = activeSchedules.reduce((max, current) => 
          current.fanSpeed > max.fanSpeed ? current : max
        );
        
        if (scheduleId.toString() !== highestSpeedSchedule._id.toString()) {
          console.log(`[SCHEDULE] Schedule ${scheduleId} blocked by higher priority schedule (speed ${highestSpeedSchedule.fanSpeed})`);
          
          // Log execution but don't send command
          await Schedule.findByIdAndUpdate(scheduleId, {
            lastExecuted: new Date(),
            $push: {
              executionHistory: {
                executedAt: new Date(),
                status: 'blocked',
                message: `Blocked by higher priority schedule (speed ${highestSpeedSchedule.fanSpeed})`,
                retryCount: 0
              }
            }
          });
          return;
        }
      }
      
      // Send command (either single schedule or highest priority)
      const result = await mqttService.sendCommand(deviceId, 'setFanSpeed', fanSpeed, 'schedule');
      if (result && result.blocked) return;
      
      await Schedule.findByIdAndUpdate(scheduleId, {
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
    } catch (error) {
      logger.error(`Error executing schedule ${scheduleId}:`, error);
    }
  }
  
  async executeScheduleEnd(scheduleId, deviceId) {
    try {
      // Check if other schedules are still active
      const currentTime = new Date();
      const activeSchedules = await this.getActiveSchedulesAtTime(deviceId, currentTime);
      
      // Remove the ending schedule from active list
      const remainingSchedules = activeSchedules.filter(s => s._id.toString() !== scheduleId.toString());
      
      console.log(`[SCHEDULE] Schedule ${scheduleId} ending. ${remainingSchedules.length} schedules still active`);
      
      // Check if pre-clean is active
      const PreClean = require('../models/PreClean');
      const activePreCleans = await PreClean.find({ 
        deviceId, 
        status: 'active' 
      });
      
      console.log(`[SCHEDULE] Found ${activePreCleans.length} active pre-cleans for device ${deviceId}`);
      
      if (activePreCleans.length > 0) {
        // Pre-clean is active - immediately cancel it and turn off device
        console.log(`[SCHEDULE] Pre-clean active - cancelling pre-clean and turning off device immediately`);
        
        // Cancel all active pre-cleans
        const preCleanService = require('./preCleanService');
        for (const preClean of activePreCleans) {
          await preCleanService.cancelPreCleanImmediately(preClean.preCleanId);
        }
        
        // Turn off device immediately
        await mqttService.sendCommand(deviceId, 'turnOff', 0, 'schedule');
        
        console.log(`[SCHEDULE] Device turned off immediately due to schedule end`);
        return;
        
        // COMMENTED: Wait for pre-clean to complete behavior
        // console.log(`[SCHEDULE] Pre-clean active - marking schedule as ended without sending command`);
        // 
        // const DeviceState = require('../models/DeviceState');
        // await DeviceState.findOneAndUpdate(
        //   { deviceId },
        //   { 
        //     $set: { 
        //       'scheduleState.scheduleEnded': true,
        //       'scheduleState.scheduleEndedAt': new Date()
        //     }
        //   },
        //   { upsert: true }
        // );
        // console.log(`[SCHEDULE] Device state updated with scheduleEnded flag`);
        // return;
      }
      
      if (remainingSchedules.length > 0) {
        // Other schedules still active - switch to highest priority one
        const highestSpeedSchedule = remainingSchedules.reduce((max, current) => 
          current.fanSpeed > max.fanSpeed ? current : max
        );
        
        console.log(`[SCHEDULE] Switching to schedule ${highestSpeedSchedule._id} (speed ${highestSpeedSchedule.fanSpeed})`);
        await mqttService.sendCommand(deviceId, 'setFanSpeed', highestSpeedSchedule.fanSpeed, 'schedule');
      } else {
        // No more active schedules - turn off device
        console.log(`[SCHEDULE] No more active schedules - turning off device`);
        await mqttService.sendCommand(deviceId, 'turnOff', 0, 'schedule');
      }
    } catch (error) {
      logger.error(`Error executing end schedule ${scheduleId}:`, error);
    }
  }
  
  /**
   * Get active schedules at a specific time
   */
  async getActiveSchedulesAtTime(deviceId, currentTime) {
    const currentDay = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTimeStr = currentTime.toTimeString().slice(0, 5); // HH:MM format
    
    // Find all schedules for this device and day
    const schedules = await Schedule.find({ 
      deviceId, 
      isActive: true,
      $or: [
        { day: currentDay },
        { days: currentDay }
      ]
    });
    
    // Filter schedules that are currently active (within time window)
    const activeSchedules = schedules.filter(schedule => {
      return currentTimeStr >= schedule.startTime && currentTimeStr < schedule.endTime;
    });
    
    return activeSchedules;
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

