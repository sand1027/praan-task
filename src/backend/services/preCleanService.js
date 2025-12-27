/**
 * PreClean Service
 * 
 * Manages pre-clean operations with precise timing
 */

const logger = require('../utils/logger');
const PreClean = require('../models/PreClean');
const DeviceState = require('../models/DeviceState');
const mqttService = require('./mqttService');
const crypto = require('crypto');

class PreCleanService {
  /**
   * Initialize the service
   */
  async initialize() {
    logger.info('PreClean service initialized');
  }

  /**
   * Start a new pre-clean operation
   */
  async startPreClean(deviceId, fanMode, durationSeconds, fanSpeed = null) {
    try {
      const deviceState = await DeviceState.findOne({ deviceId });
      if (!deviceState) {
        throw new Error('Device not found');
      }

      // Get current state from device state (most reliable source)
      const currentState = {
        fanSpeed: deviceState.currentFanSpeed,
        powerOn: deviceState.powerOn
      };
      
      logger.info(`PreClean saving current state: Fan Speed: ${currentState.fanSpeed}, Power: ${currentState.powerOn}`);

      const preClean = new PreClean({
        preCleanId: crypto.randomUUID(),
        deviceId,
        fanMode,
        fanSpeed: fanSpeed, // Store the fanSpeed for MANUAL mode
        duration: durationSeconds,
        previousState: currentState,
        scheduledEndAt: new Date(Date.now() + durationSeconds * 1000)
      });

      await preClean.save();
      logger.info(`PreClean created: ${preClean.preCleanId} for device ${deviceId}`);

      console.log(`[PRECLEAN] Starting ${fanMode} mode for ${durationSeconds} seconds`);
      
      // Send command to device based on fan mode
      let targetFanSpeed;
      switch (fanMode) {
        case 'OFF':
          mqttService.sendCommand(deviceId, 'turnOff', 0, 'preclean').catch(console.error);
          break;
        case 'AUTO':
          targetFanSpeed = 3;
          mqttService.sendCommand(deviceId, 'setFanSpeed', targetFanSpeed, 'preclean').catch(console.error);
          break;
        case 'MANUAL':
          targetFanSpeed = fanSpeed || 2; // Use provided fanSpeed or default to 2
          mqttService.sendCommand(deviceId, 'setFanSpeed', targetFanSpeed, 'preclean').catch(console.error);
          break;
        case 'PRE_CLEAN':
          targetFanSpeed = 5;
          mqttService.sendCommand(deviceId, 'setFanSpeed', targetFanSpeed, 'preclean').catch(console.error);
          break;
      }
      
      console.log(`[PRECLEAN] Command sent, now setting timer for ${durationSeconds} seconds`);
      
      // Set timer for completion
      const self = this;
      const timerId = setTimeout(async () => {
        try {
          console.log(`[TIMER] Pre-clean timer fired for ${preClean.preCleanId} after ${durationSeconds} seconds`);
          const activePreClean = await PreClean.findOne({ 
            preCleanId: preClean.preCleanId, 
            status: 'active' 
          });
          if (activePreClean) {
            console.log(`[TIMER] Found active pre-clean ${preClean.preCleanId}, completing it`);
            await self.completePreClean(activePreClean);
          } else {
            console.log(`[TIMER] Pre-clean ${preClean.preCleanId} not found or already completed`);
          }
        } catch (error) {
          console.error(`[TIMER] Error completing pre-clean:`, error);
        }
      }, durationSeconds * 1000);
      
      console.log(`[PRECLEAN] Timer ${timerId} set successfully for ${durationSeconds} seconds`);

      return preClean;
    } catch (error) {
      logger.error('Error starting pre-clean:', error);
      throw error;
    }
  }

  /**
   * Cancel active pre-cleans for a device
   */
  async cancelActivePreCleans(deviceId) {
    const activePreCleans = await PreClean.findActiveByDevice(deviceId);
    
    for (const preClean of activePreCleans) {
      await preClean.markCancelled();
      logger.info(`Cancelled pre-clean: ${preClean.preCleanId}`);
    }
  }

  /**
   * Complete a pre-clean and restore to previous state
   */
  async completePreClean(preClean) {
    try {
      console.log(`[COMPLETE] Starting completion of pre-clean: ${preClean.preCleanId}`);
      
      // Find other active pre-cleans BEFORE marking this one as completed
      const activePreCleans = await PreClean.find({
        deviceId: preClean.deviceId,
        status: 'active',
        _id: { $ne: preClean._id }
      }).sort({ startedAt: -1 });
      
      console.log(`[COMPLETE] Found ${activePreCleans.length} other active pre-cleans`);
      
      // Mark this pre-clean as completed
      preClean.status = 'completed';
      preClean.actualEndAt = new Date();
      await preClean.save();
      console.log(`[COMPLETE] Marked pre-clean ${preClean.preCleanId} as completed`);
      
      if (activePreCleans.length > 0) {
        // Restore to the most recent active pre-clean's target speed
        const mostRecentPreClean = activePreCleans[0]; // Already sorted by startedAt desc
        console.log(`[COMPLETE] ${activePreCleans.length} other pre-cleans still active - restoring to most recent pre-clean`);
        
        let targetSpeed;
        switch (mostRecentPreClean.fanMode) {
          case 'OFF':
            await mqttService.sendCommand(preClean.deviceId, 'turnOff', 0, 'restore');
            console.log(`[COMPLETE] Restored to most recent pre-clean: OFF`);
            return;
          case 'AUTO':
            targetSpeed = 3;
            break;
          case 'MANUAL':
            targetSpeed = mostRecentPreClean.fanSpeed || 2;
            break;
          case 'PRE_CLEAN':
            targetSpeed = 5;
            break;
        }
        
        await mqttService.sendCommand(preClean.deviceId, 'setFanSpeed', targetSpeed, 'restore');
        console.log(`[COMPLETE] Restored to most recent pre-clean: ${mostRecentPreClean.fanMode} speed ${targetSpeed}`);
      } else {
        // No more active pre-cleans - check if schedule ended while pre-clean was active
        console.log(`[COMPLETE] No active pre-cleans remaining - checking schedule status`);
        
        // Check if any schedules are currently active
        const schedulerService = require('./schedulerService');
        const currentTime = new Date();
        const activeSchedules = await schedulerService.getActiveSchedulesAtTime(preClean.deviceId, currentTime);
        
        console.log(`[COMPLETE] Found ${activeSchedules.length} active schedules at current time`);
        
        if (activeSchedules.length > 0) {
          // There are active schedules - restore to highest priority schedule
          const highestSpeedSchedule = activeSchedules.reduce((max, current) => 
            current.fanSpeed > max.fanSpeed ? current : max
          );
          console.log(`[COMPLETE] Active schedule found - restoring to schedule speed ${highestSpeedSchedule.fanSpeed}`);
          await mqttService.sendCommand(preClean.deviceId, 'setFanSpeed', highestSpeedSchedule.fanSpeed, 'restore');
        } else {
          // No active schedules - restore to the state this pre-clean saved
          const originalState = preClean.previousState;
          console.log(`[COMPLETE] No active schedules - restoring to saved state: Fan Speed ${originalState.fanSpeed}, Power ${originalState.powerOn}`);
          
          if (originalState.powerOn) {
            await mqttService.sendCommand(preClean.deviceId, 'setFanSpeed', originalState.fanSpeed, 'restore');
          } else {
            await mqttService.sendCommand(preClean.deviceId, 'turnOff', 0, 'restore');
          }
        }
      }
      
      logger.info(`Pre-clean completed: ${preClean.preCleanId}`);
      
    } catch (error) {
      logger.error(`Error completing pre-clean ${preClean.preCleanId}:`, error);
    }
  }

  /**
   * Get active pre-cleans for a device
   */
  async getActivePreCleans(deviceId) {
    return await PreClean.findActiveByDevice(deviceId);
  }

  /**
   * Get pre-clean history for a device
   */
  async getPreCleanHistory(deviceId, limit = 10) {
    return await PreClean.find({ deviceId })
      .sort({ startedAt: -1 })
      .limit(limit);
  }

  /**
   * Cancel a specific pre-clean immediately (called by schedule end)
   */
  async cancelPreCleanImmediately(preCleanId) {
    try {
      const preClean = await PreClean.findOne({ preCleanId, status: 'active' });
      
      if (!preClean) {
        console.log(`[CANCEL] Pre-clean ${preCleanId} not found or already completed`);
        return;
      }
      
      console.log(`[CANCEL] Immediately cancelling pre-clean ${preCleanId}`);
      
      // Mark as cancelled
      preClean.status = 'cancelled';
      preClean.actualEndAt = new Date();
      await preClean.save();
      
      console.log(`[CANCEL] Pre-clean ${preCleanId} cancelled successfully`);
      
    } catch (error) {
      logger.error(`Error cancelling pre-clean ${preCleanId}:`, error);
    }
  }

  /**
   * Delete a specific pre-clean
   */
  async deletePreClean(preCleanId) {
    try {
      const preClean = await PreClean.findOne({ preCleanId });
      
      if (!preClean) {
        return null;
      }
      
      // If it's active, mark as cancelled instead of deleting
      if (preClean.status === 'active') {
        console.log(`[DELETE] Marking active pre-clean ${preCleanId} as cancelled`);
        preClean.status = 'cancelled';
        preClean.actualEndAt = new Date();
        await preClean.save();
        
        // Trigger immediate restoration to handle the stack properly
        await this.completePreClean(preClean);
      } else {
        // If already completed/cancelled, safe to delete
        await PreClean.deleteOne({ preCleanId });
        console.log(`[DELETE] Deleted completed pre-clean ${preCleanId}`);
      }
      
      return preClean;
    } catch (error) {
      logger.error(`Error deleting pre-clean ${preCleanId}:`, error);
      throw error;
    }
  }

  /**
   * Check if device has active pre-clean
   */
  async hasActivePreClean(deviceId) {
    const activePreCleans = await PreClean.findActiveByDevice(deviceId);
    return activePreCleans.length > 0;
  }

  /**
   * Shutdown the service
   */
  shutdown() {
    logger.info('PreClean service shutdown');
  }
}

module.exports = new PreCleanService();