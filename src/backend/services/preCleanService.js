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
  async startPreClean(deviceId, fanMode, durationSeconds) {
    try {
      const deviceState = await DeviceState.findOne({ deviceId });
      if (!deviceState) {
        throw new Error('Device not found');
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      
      const updatedDeviceState = await DeviceState.findOne({ deviceId });
      const currentState = {
        fanSpeed: updatedDeviceState ? updatedDeviceState.currentFanSpeed : deviceState.currentFanSpeed,
        powerOn: updatedDeviceState ? updatedDeviceState.powerOn : deviceState.powerOn
      };
      
      logger.info(`PreClean saving current state: Fan Speed: ${currentState.fanSpeed}, Power: ${currentState.powerOn}`);

      const preClean = new PreClean({
        preCleanId: crypto.randomUUID(),
        deviceId,
        targetFanSpeed: fanMode,
        duration: durationSeconds,
        previousState: currentState,
        scheduledEndAt: new Date(Date.now() + durationSeconds * 1000)
      });

      await preClean.save();
      logger.info(`PreClean created: ${preClean.preCleanId} for device ${deviceId}`);

      // Send command to device
      mqttService.sendCommand(deviceId, 'setFanSpeed', fanMode, 'preclean')
        .then(() => {
          logger.info(`PreClean command sent successfully: ${preClean.preCleanId}`);
        })
        .catch((error) => {
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
        // Restore to the most recent active pre-clean's fan speed
        const mostRecentPreClean = activePreCleans[0];
        console.log(`[COMPLETE] Restoring to active pre-clean ${mostRecentPreClean.preCleanId} with fan speed ${mostRecentPreClean.targetFanSpeed}`);
        
        await mqttService.sendCommand(preClean.deviceId, 'setFanSpeed', mostRecentPreClean.targetFanSpeed, 'restore');
      } else {
        // No more active pre-cleans - restore to original state
        console.log(`[COMPLETE] No active pre-cleans remaining - finding original state`);
        
        const firstPreClean = await PreClean.findOne({
          deviceId: preClean.deviceId,
          status: 'completed'
        }).sort({ startedAt: 1 });
        
        if (firstPreClean && firstPreClean.previousState) {
          const originalState = firstPreClean.previousState;
          console.log(`[COMPLETE] Restoring to original state: Fan Speed ${originalState.fanSpeed}, Power ${originalState.powerOn}`);
          
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