/**
 * MongoDB Schema for Command Logs
 * 
 * This tracks all commands sent to devices (for debugging and audit trail)
 */

const mongoose = require('mongoose');

const commandLogSchema = new mongoose.Schema({
  // Unique command identifier
  commandId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Target device
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  
  // Command action (setFanSpeed, turnOff, etc.)
  action: {
    type: String,
    required: true,
    enum: ['setFanSpeed', 'turnOff', 'turnOn']
  },
  
  // Command value (e.g., fan speed number)
  value: {
    type: Number,
    min: 0,
    max: 5
  },
  
  // Command source (schedule, preclean, manual, control)
  source: {
    type: String,
    required: true,
    enum: ['schedule', 'preclean', 'manual', 'restore', 'control']
  },
  
  // Command status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'sent', 'acknowledged', 'failed', 'timeout'],
    default: 'pending'
  },
  
  // When command was sent
  sentAt: {
    type: Date,
    default: Date.now
  },
  
  // When acknowledgment was received
  acknowledgedAt: {
    type: Date
  },
  
  // Retry attempts
  retryCount: {
    type: Number,
    default: 0
  },
  
  // Error message if failed
  errorMessage: {
    type: String
  },
  
  // Response from device
  deviceResponse: {
    status: String,
    message: String,
    timestamp: Date
  }
}, {
  timestamps: true
});

// Index for querying recent commands
commandLogSchema.index({ deviceId: 1, sentAt: -1 });
commandLogSchema.index({ status: 1, sentAt: -1 });

const CommandLog = mongoose.model('CommandLog', commandLogSchema);

module.exports = CommandLog;

