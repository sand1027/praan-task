/**
 * MongoDB Schema for Sensor Data
 * 
 * This defines the structure of how we store sensor readings in the database.
 * Think of it like a form template - every sensor reading must follow this format.
 */

const mongoose = require('mongoose');

// Define the schema (structure) for sensor data
const sensorDataSchema = new mongoose.Schema({
  // Which device sent this data?
  deviceId: {
    type: String,
    required: true,
    index: true  // Index for faster queries (like a book index)
  },
  
  // When was this data recorded?
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true  // Index for time-based queries
  },
  
  // Network signal strength (1-100)
  networkStrength: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  // Temperature in Celsius
  temperature: {
    type: Number,
    required: true,
    min: -50,
    max: 100
  },
  
  // Humidity percentage
  humidity: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  // Particulate Matter 1.0 (tiny particles)
  pm1: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Particulate Matter 2.5 (small particles - most dangerous)
  pm25: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Particulate Matter 10 (larger particles)
  pm10: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Sound level in decibels
  sound: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Volatile Organic Compounds (chemical pollutants)
  voc: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Current fan speed (0-5)
  fanSpeed: {
    type: Number,
    required: true,
    min: 0,
    max: 5
  },
  
  // Is device powered on?
  powerOn: {
    type: Boolean,
    required: true,
    default: true
  }
}, {
  // Automatically add createdAt and updatedAt timestamps
  timestamps: true
});

// Create compound index for efficient queries by device and time
sensorDataSchema.index({ deviceId: 1, timestamp: -1 });

// Create the model (like creating a class from the schema)
const SensorData = mongoose.model('SensorData', sensorDataSchema);

module.exports = SensorData;

