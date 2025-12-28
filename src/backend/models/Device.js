const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['AIR_PURIFIER', 'HUMIDIFIER', 'FAN'],
    default: 'AIR_PURIFIER'
  },
  location: {
    room: String,
    building: String,
    floor: String
  },
  specifications: {
    model: String,
    manufacturer: String,
    maxFanSpeed: {
      type: Number,
      default: 5
    },
    powerRating: Number, // Watts
    coverage: Number     // Square feet
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'offline'],
    default: 'active'
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  firmware: {
    version: String,
    lastUpdated: Date
  },
  owner: {
    userId: String,
    organizationId: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ status: 1 });
deviceSchema.index({ 'owner.organizationId': 1 });

// Static method to get all active devices
deviceSchema.statics.getActiveDevices = function() {
  return this.find({ status: 'active' });
};

// Instance method to mark device as online
deviceSchema.methods.markOnline = function() {
  this.lastSeen = new Date();
  this.status = 'active';
  return this.save();
};

// Instance method to mark device as offline
deviceSchema.methods.markOffline = function() {
  this.status = 'offline';
  return this.save();
};

module.exports = mongoose.model('Device', deviceSchema);