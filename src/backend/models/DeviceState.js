/**
 * MongoDB Schema for Device State
 * 
 * This stores the current state of each device (for pre-clean restore functionality)
 */

const mongoose = require('mongoose');

const deviceStateSchema = new mongoose.Schema({
  // Unique device identifier
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Current fan speed
  currentFanSpeed: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
    default: 0
  },
  
  // Is device currently powered on?
  powerOn: {
    type: Boolean,
    required: true,
    default: false
  },
  
  // Is device currently online?
  isOnline: {
    type: Boolean,
    default: false
  },
  
  // Last time device sent data
  lastSeen: {
    type: Date,
    default: Date.now
  },
  
  // Pre-clean state (for temporary overrides)
  preCleanState: {
    isActive: {
      type: Boolean,
      default: false
    },
    previousFanSpeed: {
      type: Number,
      min: 0,
      max: 5
    },
    targetFanSpeed: {
      type: Number,
      min: 1,
      max: 5
    },
    startedAt: Date,
    duration: Number, // in seconds
    timeoutId: String // For tracking the restore timeout
  },
  
  // Schedule state (for tracking active schedules and original state)
  scheduleState: {
    originalFanSpeed: {
      type: Number,
      min: 0,
      max: 5
    },
    originalPowerOn: {
      type: Boolean
    },
    activeScheduleCount: {
      type: Number,
      default: 0
    }
  },
  
  // Last fan speed before device was turned off (for restore on turn on)
  lastFanSpeedBeforeOff: {
    type: Number,
    min: 0,
    max: 5
  },
  
  // Latest sensor readings (for quick access)
  latestSensorData: {
    temperature: Number,
    humidity: Number,
    pm25: Number,
    networkStrength: Number,
    timestamp: Date
  },
  
  // State stack for handling multiple overlapping operations
  stateStack: [{
    fanSpeed: {
      type: Number,
      min: 0,
      max: 5
    },
    powerOn: Boolean,
    timestamp: Date,
    operation: String, // 'preclean', 'schedule', 'manual'
    operationId: String
  }]
}, {
  timestamps: true
});

const DeviceState = mongoose.model('DeviceState', deviceStateSchema);

module.exports = DeviceState;

