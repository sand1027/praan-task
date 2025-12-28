/**
 * MQTT Service
 * 
 * This handles all MQTT communication between backend and devices.
 * Think of it as the "post office manager" that sends and receives messages.
 */

const mqtt = require('mqtt');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Generate UUID v4
function uuidv4() {
  return crypto.randomUUID();
}
const SensorData = require('../models/SensorData');
const DeviceState = require('../models/DeviceState');
const CommandLog = require('../models/CommandLog');

class MQTTService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    
    // Store pending commands waiting for acknowledgment
    this.pendingCommands = new Map();
    
    // Retry configuration
    this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
    this.retryTimeout = parseInt(process.env.RETRY_TIMEOUT) || 30000; // 30 seconds
  }
  
  /**
   * Connect to MQTT broker
   */
  connect() {
    return new Promise((resolve, reject) => {
      const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
      
      logger.info(`Connecting to MQTT broker: ${brokerUrl}`);
      
      this.client = mqtt.connect(brokerUrl, {
        clientId: `backend_${Date.now()}`,
        clean: true,
        reconnectPeriod: 5000,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD
      });
      
      // Connection successful
      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('Successfully connected to MQTT broker');
        
        // Subscribe to all device data topics
        this.client.subscribe('device/+/data', { qos: 1 }, (err) => {
          if (err) {
            logger.error('Failed to subscribe to device data topics:', err);
          } else {
            logger.info('Subscribed to: device/+/data');
          }
        });
        
        // Subscribe to all device acknowledgment topics
        this.client.subscribe('device/+/ack', { qos: 1 }, (err) => {
          if (err) {
            logger.error('Failed to subscribe to device ack topics:', err);
          } else {
            logger.info('Subscribed to: device/+/ack');
          }
        });
        
        resolve();
      });
      
      // Handle incoming messages
      this.client.on('message', async (topic, message) => {
        try {
          await this.handleMessage(topic, message);
        } catch (error) {
          logger.error('Error handling MQTT message:', error);
        }
      });
      
      // Connection lost
      this.client.on('offline', () => {
        this.isConnected = false;
        logger.warn('MQTT client is offline');
      });
      
      // Reconnecting
      this.client.on('reconnect', () => {
        logger.info('Reconnecting to MQTT broker...');
      });
      
      // Error occurred
      this.client.on('error', (error) => {
        logger.error('MQTT client error:', error);
        reject(error);
      });
    });
  }
  
  /**
   * Handle incoming MQTT messages
   */
  async handleMessage(topic, message) {
    try {
      const data = JSON.parse(message.toString());
      
      // Determine message type based on topic
      if (topic.includes('/data')) {
        await this.handleSensorData(data);
      } else if (topic.includes('/ack')) {
        await this.handleAcknowledgment(data);
      }
    } catch (error) {
      logger.error(`Error parsing message from ${topic}:`, error);
    }
  }
  
  /**
   * Handle sensor data from devices
   */
  async handleSensorData(data) {
    try {
      logger.info(`Received sensor data from device: ${data.deviceId}`);
      
      // Auto-register device if it doesn't exist
      await this.ensureDeviceExists(data.deviceId);
      
      // Save sensor data to MongoDB
      const sensorReading = new SensorData({
        deviceId: data.deviceId,
        timestamp: new Date(data.timestamp),
        networkStrength: data.networkStrength,
        temperature: data.temperature,
        humidity: data.humidity,
        pm1: data.pm1,
        pm25: data.pm25,
        pm10: data.pm10,
        sound: data.sound,
        voc: data.voc,
        fanSpeed: data.fanSpeed,
        powerOn: data.powerOn
      });
      
      await sensorReading.save();
      logger.info(`Sensor data saved to database for device: ${data.deviceId}`);
      
      // Update device state
      const updateData = {
        currentFanSpeed: data.fanSpeed,
        powerOn: data.powerOn,
        isOnline: data.powerOn, // Device is online only if powered on
        lastSeen: new Date(),
        latestSensorData: {
          temperature: data.temperature,
          humidity: data.humidity,
          pm25: data.pm25,
          networkStrength: data.networkStrength,
          timestamp: new Date(data.timestamp)
        }
      };
      
      // Special handling for auto-off notifications
      if (data.autoOff) {
        updateData.isOnline = false;
        logger.info(`Device ${data.deviceId} auto-turned off - marking as offline`);
      }
      
      await DeviceState.findOneAndUpdate(
        { deviceId: data.deviceId },
        updateData,
        { upsert: true, new: true }
      );
      
    } catch (error) {
      logger.error('Error handling sensor data:', error);
    }
  }
  
  /**
   * Ensure device exists in database (auto-register if needed)
   */
  async ensureDeviceExists(deviceId) {
    try {
      const Device = require('../models/Device');
      
      const existingDevice = await Device.findOne({ deviceId });
      if (!existingDevice) {
        // Auto-register device with default values
        const device = new Device({
          deviceId,
          name: `Auto-registered ${deviceId}`,
          type: 'AIR_PURIFIER',
          location: {
            room: 'Unknown',
            building: 'Unknown'
          },
          specifications: {
            model: 'Unknown',
            manufacturer: 'Unknown',
            maxFanSpeed: 5
          },
          status: 'active'
        });
        
        await device.save();
        logger.info(`Auto-registered device: ${deviceId}`);
      }
    } catch (error) {
      logger.error(`Error ensuring device exists: ${deviceId}`, error);
    }
  }
  
  /**
   * Handle acknowledgment from devices
   */
  async handleAcknowledgment(data) {
    try {
      logger.info(`Received acknowledgment from device: ${data.deviceId}`);
      logger.info(`Command ${data.commandId}: ${data.status} - ${data.message}`);
      
      // Update command log
      await CommandLog.findOneAndUpdate(
        { commandId: data.commandId },
        {
          status: data.status === 'success' ? 'acknowledged' : 'failed',
          acknowledgedAt: new Date(),
          deviceResponse: {
            status: data.status,
            message: data.message,
            timestamp: new Date(data.timestamp)
          }
        }
      );
      
      // Clear pending command timeout
      if (this.pendingCommands.has(data.commandId)) {
        const { timeoutId } = this.pendingCommands.get(data.commandId);
        clearTimeout(timeoutId);
        this.pendingCommands.delete(data.commandId);
      }
      
      // Update device state if command was successful
      if (data.status === 'success' && data.currentState) {
        const updateData = {
          currentFanSpeed: data.currentState.fanSpeed,
          powerOn: data.currentState.powerOn,
          isOnline: true,
          lastSeen: new Date()
        };
        
        // If device was turned off, mark as offline since it won't send more data
        if (!data.currentState.powerOn) {
          updateData.isOnline = false;
        }
        
        await DeviceState.findOneAndUpdate(
          { deviceId: data.deviceId },
          updateData,
          { upsert: true }
        );
      }
      
    } catch (error) {
      logger.error('Error handling acknowledgment:', error);
    }
  }
  
  /**
   * Send command to device with retry logic
   * 
   * @param {string} deviceId - Target device ID
   * @param {string} action - Command action (setFanSpeed, turnOff, etc.)
   * @param {number} value - Command value (fan speed)
   * @param {string} source - Command source (schedule, preclean, manual)
   * @returns {Promise<Object>} Command result
   */
  async sendCommand(deviceId, action, value, source = 'manual') {
    // Pre-clean has higher priority - block schedule START commands if pre-clean is active
    // But allow schedule END commands to go through
    if (source === 'schedule' && action !== 'turnOff') {
      const PreClean = require('../models/PreClean');
      const activePreCleans = await PreClean.find({ 
        deviceId, 
        status: 'active' 
      });
      
      if (activePreCleans.length > 0) {
        logger.info(`🚫 BLOCKING schedule START command for ${deviceId} - ${activePreCleans.length} pre-clean(s) active`);
        console.log(`[BLOCK] Schedule command blocked: ${action} value ${value}`);
        return { blocked: true, reason: 'Pre-clean override active' };
      } else {
        console.log(`[ALLOW] No active pre-cleans, allowing schedule command: ${action} value ${value}`);
      }
    } else if (source === 'schedule' && action === 'turnOff') {
      // Always allow schedule END commands, but mark the schedule as ended
      console.log(`[ALLOW] Schedule END command: ${action} value ${value}`);
      
      // Mark that this schedule has ended - update device state
      const DeviceState = require('../models/DeviceState');
      await DeviceState.findOneAndUpdate(
        { deviceId },
        { 
          $set: { 
            'scheduleState.scheduleEnded': true,
            'scheduleState.scheduleEndedAt': new Date()
          }
        },
        { upsert: true }
      );
    } else {
      console.log(`[COMMAND] ${source} command: ${action} value ${value}`);
    }
    
    const commandId = uuidv4();
    
    const command = {
      commandId,
      action,
      value,
      timestamp: new Date().toISOString()
    };
    
    // Log command in database
    const commandLog = new CommandLog({
      commandId,
      deviceId,
      action,
      value,
      source,
      status: 'pending'
    });
    
    await commandLog.save();
    
    // Send command with retry logic
    return this.sendCommandWithRetry(deviceId, command, 0);
  }
  
  /**
   * Send command with retry logic (internal method)
   */
  async sendCommandWithRetry(deviceId, command, retryCount) {
    return new Promise((resolve, reject) => {
      const topic = `device/${deviceId}/command`;
      
      logger.info(`Sending command to ${deviceId} (attempt ${retryCount + 1}/${this.maxRetries + 1})`);
      logger.info(`Command: ${JSON.stringify(command)}`);
      
      // Publish command to MQTT
      this.client.publish(topic, JSON.stringify(command), { qos: 1 }, async (err) => {
        if (err) {
          logger.error('Failed to publish command:', err);
          
          // Update command log
          await CommandLog.findOneAndUpdate(
            { commandId: command.commandId },
            {
              status: 'failed',
              errorMessage: err.message,
              retryCount
            }
          );
          
          reject(err);
          return;
        }
        
        // Update command log
        await CommandLog.findOneAndUpdate(
          { commandId: command.commandId },
          {
            status: 'sent',
            sentAt: new Date(),
            retryCount
          }
        );
        
        // Set timeout for acknowledgment
        const timeoutId = setTimeout(async () => {
          logger.warn(`No acknowledgment received for command ${command.commandId}`);
          
          // Remove from pending commands
          this.pendingCommands.delete(command.commandId);
          
          // Retry if not exceeded max retries
          if (retryCount < this.maxRetries) {
            logger.info(`Retrying command ${command.commandId}...`);
            try {
              const result = await this.sendCommandWithRetry(deviceId, command, retryCount + 1);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          } else {
            // Max retries exceeded
            logger.error(`Command ${command.commandId} failed after ${this.maxRetries} retries`);
            
            await CommandLog.findOneAndUpdate(
              { commandId: command.commandId },
              {
                status: 'timeout',
                errorMessage: `No acknowledgment after ${this.maxRetries} retries`
              }
            );
            
            reject(new Error('Device did not respond after maximum retries'));
          }
        }, this.retryTimeout);
        
        // Store pending command
        this.pendingCommands.set(command.commandId, {
          command,
          timeoutId,
          resolve,
          reject
        });
      });
    });
  }
  
  /**
   * Disconnect from MQTT broker
   */
  disconnect() {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
      logger.info('Disconnected from MQTT broker');
    }
  }
}

// Export singleton instance
module.exports = new MQTTService();

