/**
 * MongoDB Schema for Device Schedules
 * 
 * This stores recurring schedules like "Every Monday 9am-5pm, run fan at speed 3"
 */

const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  // Which device is this schedule for?
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  
  // Day of the week (Monday, Tuesday, etc.)
  day: {
    type: String,
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  
  // Start time (format: "HH:MM" like "09:00")
  startTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Check if time format is valid (HH:MM)
        return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Start time must be in HH:MM format (e.g., 09:00)'
    }
  },
  
  // End time (format: "HH:MM" like "17:00")
  endTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'End time must be in HH:MM format (e.g., 17:00)'
    }
  },
  
  // Fan speed to set (1-5)
  fanSpeed: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  
  // Is this schedule active?
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Last time this schedule was executed
  lastExecuted: {
    type: Date,
    default: null
  },
  
  // Track execution history
  executionHistory: [{
    executedAt: Date,
    status: {
      type: String,
      enum: ['success', 'failed', 'retrying']
    },
    message: String,
    retryCount: {
      type: Number,
      default: 0
    }
  }]
}, {
  timestamps: true
});

// Create compound index for efficient queries
scheduleSchema.index({ deviceId: 1, day: 1, startTime: 1 });

const Schedule = mongoose.model('Schedule', scheduleSchema);

module.exports = Schedule;

