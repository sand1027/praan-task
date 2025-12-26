/**
 * MongoDB Schema for PreClean Operations
 * 
 * This stores all pre-clean operations with their state and relationships
 */

const mongoose = require('mongoose');

const preCleanSchema = new mongoose.Schema({
  // Unique identifier for this pre-clean operation
  preCleanId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Device this pre-clean applies to
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  
  // Pre-clean configuration
  targetFanSpeed: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  
  duration: {
    type: Number,
    required: true,
    min: 1,
    max: 3600 // seconds
  },
  
  // State before pre-clean started
  previousState: {
    fanSpeed: {
      type: Number,
      required: true,
      min: 0,
      max: 5
    },
    powerOn: {
      type: Boolean,
      required: true
    }
  },
  
  // Timing information
  startedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  scheduledEndAt: {
    type: Date,
    required: true
  },
  
  actualEndAt: {
    type: Date
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled', 'expired'],
    default: 'active',
    index: true
  },
  
  // Relationships with other operations
  relationships: {
    // Active schedules when this pre-clean started
    activeSchedules: [{
      scheduleId: String,
      fanSpeed: Number,
      startTime: String,
      endTime: String
    }],
    
    // Other pre-cleans that were active
    overlappingPreCleans: [String]
  },
  
  // Execution details
  execution: {
    commandSent: {
      type: Boolean,
      default: false
    },
    commandAcknowledged: {
      type: Boolean,
      default: false
    },
    restoreCommandSent: {
      type: Boolean,
      default: false
    },
    restoreCommandAcknowledged: {
      type: Boolean,
      default: false
    },
    errorMessage: String
  },
  
  // Source of the pre-clean request
  source: {
    type: String,
    enum: ['manual', 'api', 'schedule', 'automation'],
    default: 'manual'
  },
  
  // User or system that initiated this pre-clean
  initiatedBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
preCleanSchema.index({ deviceId: 1, status: 1 });
preCleanSchema.index({ scheduledEndAt: 1, status: 1 });
preCleanSchema.index({ startedAt: -1 });

// Static methods
preCleanSchema.statics.findActiveByDevice = function(deviceId) {
  return this.find({ deviceId, status: 'active' });
};

preCleanSchema.statics.findExpired = function() {
  return this.find({
    status: 'active',
    scheduledEndAt: { $lt: new Date() }
  });
};

// Instance methods
preCleanSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.actualEndAt = new Date();
  return this.save();
};

preCleanSchema.methods.markCancelled = function() {
  this.status = 'cancelled';
  this.actualEndAt = new Date();
  return this.save();
};

preCleanSchema.methods.isExpired = function() {
  return new Date() > this.scheduledEndAt;
};

preCleanSchema.methods.getRemainingSeconds = function() {
  const remaining = this.scheduledEndAt - new Date();
  return Math.max(0, Math.ceil(remaining / 1000));
};

const PreClean = mongoose.model('PreClean', preCleanSchema);

module.exports = PreClean;