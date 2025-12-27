/**
 * MongoDB Schema for PreClean Operations
 */

const mongoose = require('mongoose');

const preCleanSchema = new mongoose.Schema({
  preCleanId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  
  fanMode: {
    type: String,
    required: true,
    enum: ['OFF', 'AUTO', 'MANUAL', 'PRE_CLEAN'],
    index: true
  },
  
  duration: {
    type: Number,
    required: true,
    min: 1,
    max: 3600
  },
  
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
  
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
preCleanSchema.index({ deviceId: 1, status: 1 });
preCleanSchema.index({ scheduledEndAt: 1, status: 1 });

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

const PreClean = mongoose.model('PreClean', preCleanSchema);

module.exports = PreClean;