/**
 * PreClean Service
 * 
 * Manages pre-clean operations with proper state tracking and relationships
 */

const logger = require('../utils/logger');
const PreClean = require('../models/PreClean');
const DeviceState = require('../models/DeviceState');
const Schedule = require('../models/Schedule');
const mqttService = require('./mqttService');
const crypto = require('crypto');

class PreCleanService {
  constructor() {
    this.checkInterval = null;
    this.processingPreCleans = new Set(); // Track which pre-cleans are being processed
  }

  /**
   * Initialize the service
   */
  async initialize() {
    logger.info('Initializing PreClean service...');
    logger.info('PreClean service initialized');
  }

  /**
   * Start a new pre-clean operation
   */
  async startPreClean(deviceId, fanMode, durationSeconds, source = 'manual', initiatedBy = 'system') {
    try {
      // Get current device state
      const deviceState = await DeviceState.findOne({ deviceId });
      if (!deviceState) {
        throw new Error('Device not found');
      }

      // Get active schedules for relationship tracking (only current active ones)
      const now = new Date();
      const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
      
      const activeSchedules = await Schedule.find({ 
        deviceId, 
        isActive: true,
        day: currentDay,
        startTime: { $lte: currentTime },
        endTime: { $gte: currentTime }
      });

      // Don't cancel existing pre-cleans, stack on top of them
      // Get current device state to save as previous state for this pre-clean
      // Wait a moment to ensure device state is updated from recent commands
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const updatedDeviceState = await DeviceState.findOne({ deviceId });
      const currentState = {
        fanSpeed: updatedDeviceState ? updatedDeviceState.currentFanSpeed : deviceState.currentFanSpeed,
        powerOn: updatedDeviceState ? updatedDeviceState.powerOn : deviceState.powerOn
      };
      
      logger.info(`PreClean saving current state: Fan Speed: ${currentState.fanSpeed}, Power: ${currentState.powerOn}`);

      // Create new pre-clean record
      const preClean = new PreClean({
        preCleanId: crypto.randomUUID(),
        deviceId,
        targetFanSpeed: fanMode,
        duration: durationSeconds,
        previousState: currentState,
        scheduledEndAt: new Date(Date.now() + durationSeconds * 1000),
        relationships: {
          activeSchedules: activeSchedules.map(s => ({
            scheduleId: s._id.toString(),
            fanSpeed: s.fanSpeed,
            startTime: s.startTime,
            endTime: s.endTime
          }))
        },
        source,
        initiatedBy
      });

      await preClean.save();
      logger.info(`PreClean created: ${preClean.preCleanId} for device ${deviceId}`);

      // Send command to device (non-blocking)
      mqttService.sendCommand(deviceId, 'setFanSpeed', fanMode, 'preclean')
        .then(() => {
          preClean.execution.commandSent = true;
          preClean.execution.commandAcknowledged = true;
          preClean.save();
          logger.info(`PreClean command sent successfully: ${preClean.preCleanId}`);
        })
        .catch((error) => {
          preClean.execution.errorMessage = error.message;
          preClean.save();
          logger.error(`PreClean command failed: ${error.message}`);
        });

      // Set precise timer for completion
      setTimeout(async () => {
        try {
          console.log(`[TIMER] Pre-clean timer fired for ${preClean.preCleanId} after ${durationSeconds} seconds`);
          const activePreClean = await PreClean.findOne({ 
            preCleanId: preClean.preCleanId, 
            status: 'active' 
          });
          if (activePreClean) {
            console.log(`[TIMER] Found active pre-clean ${preClean.preCleanId}, completing it`);
            await this.completePreClean(activePreClean);
          } else {
            console.log(`[TIMER] Pre-clean ${preClean.preCleanId} is no longer active`);
          }
        } catch (error) {
          console.error(`[TIMER] Error completing pre-clean ${preClean.preCleanId}:`, error);
        }
      }, durationSeconds * 1000);

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
   * Complete a pre-clean and restore to previous active pre-clean if any
   */
  async completePreClean(preClean) {
    try {
      console.log(`[COMPLETE] Starting completion of pre-clean: ${preClean.preCleanId}`);
      
      // Find all active pre-cleans for this device BEFORE marking this one as completed
      const activePreCleans = await PreClean.find({
        deviceId: preClean.deviceId,
        status: 'active',
        _id: { $ne: preClean._id } // Exclude the current one by ID
      }).sort({ startedAt: -1 }); // Most recent first
      
      console.log(`[COMPLETE] Found ${activePreCleans.length} other active pre-cleans`);
      if (activePreCleans.length > 0) {
        console.log(`[COMPLETE] Other active pre-cleans:`, activePreCleans.map(p => ({
          id: p.preCleanId,
          targetSpeed: p.targetFanSpeed,
          startedAt: p.startedAt
        })));
      }
      
      // Mark this pre-clean as completed
      preClean.status = 'completed';
      preClean.actualEndAt = new Date();
      await preClean.save();
      console.log(`[COMPLETE] Marked pre-clean ${preClean.preCleanId} as completed`);
      
      if (activePreCleans.length > 0) {
        // Restore to the most recent active pre-clean's fan speed
        const mostRecentPreClean = activePreCleans[0];
        console.log(`[COMPLETE] Restoring to active pre-clean ${mostRecentPreClean.preCleanId} with fan speed ${mostRecentPreClean.targetFanSpeed}`);
        
        try {
          await mqttService.sendCommand(preClean.deviceId, 'setFanSpeed', mostRecentPreClean.targetFanSpeed, 'restore');
          console.log(`[COMPLETE] Restore command sent successfully`);
        } catch (error) {
          console.error(`[COMPLETE] Error sending restore command: ${error.message}`);
        }
      } else {
        // No more active pre-cleans - restore to original state before first pre-clean
        console.log(`[COMPLETE] No active pre-cleans remaining - finding original state`);
        
        // Find the first pre-clean that was started (oldest one) to get the original state
        const firstPreClean = await PreClean.findOne({
          deviceId: preClean.deviceId,
          status: 'completed'
        }).sort({ startedAt: 1 }); // Oldest first
        
        if (firstPreClean && firstPreClean.previousState) {
          const originalState = firstPreClean.previousState;
          console.log(`[COMPLETE] Restoring to original state: Fan Speed ${originalState.fanSpeed}, Power ${originalState.powerOn}`);
          
          try {
            if (originalState.powerOn) {
              await mqttService.sendCommand(preClean.deviceId, 'setFanSpeed', originalState.fanSpeed, 'restore');
            } else {
              await mqttService.sendCommand(preClean.deviceId, 'turnOff', 0, 'restore');
            }
            console.log(`[COMPLETE] Original state restore command sent successfully`);
          } catch (error) {
            console.error(`[COMPLETE] Error restoring original state: ${error.message}`);
          }
        } else {
          console.log(`[COMPLETE] No original state found - device stays at current speed`);
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
   * Manually check and complete any expired pre-cleans (for debugging)
   */
  async forceCompleteExpired(deviceId) {
    try {
      const now = new Date();
      const expiredPreCleans = await PreClean.find({
        deviceId,
        status: 'active',
        scheduledEndAt: { $lt: now }
      });
      
      console.log(`[FORCE] Found ${expiredPreCleans.length} expired pre-cleans for device ${deviceId}`);
      
      for (const preClean of expiredPreCleans) {
        console.log(`[FORCE] Completing expired pre-clean: ${preClean.preCleanId}`);
        await this.completePreClean(preClean);
      }
      
      return expiredPreCleans.length;
    } catch (error) {
      console.error('[FORCE] Error force completing expired pre-cleans:', error);
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