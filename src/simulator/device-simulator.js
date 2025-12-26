/**
 * IoT Air Purifier Device Simulator
 * 
 * This script simulates a real air purifier device that:
 * 1. Publishes sensor data every 2 minutes to MQTT broker
 * 2. Listens for commands (fan speed changes, turn off)
 * 3. Maintains internal state (current fan speed, power status)
 * 4. Generates realistic sensor data with gradual changes
 */

const mqtt = require('mqtt');

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // MQTT Broker connection details
  brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://test.mosquitto.org:1883',
  
  // Unique device identifier (like a serial number)
  deviceId: process.env.DEVICE_ID || 'AIR_PURIFIER_001',
  
  // How often to send sensor data (2 minutes = 120000 milliseconds)
  dataPublishInterval: 2 * 60 * 1000, // 2 minutes
  
  // MQTT Topics (like addresses for messages)
  topics: {
    // Where device sends sensor data TO backend
    data: (deviceId) => `device/${deviceId}/data`,
    
    // Where device receives commands FROM backend
    command: (deviceId) => `device/${deviceId}/command`,
    
    // Where device sends acknowledgments (confirmations)
    ack: (deviceId) => `device/${deviceId}/ack`
  }
};

// ============================================
// DEVICE STATE (Current status of the device)
// ============================================

const deviceState = {
  // Is the device powered on?
  powerOn: false,
  
  // Current fan speed (0 = off, 1-5 = speed levels)
  fanSpeed: 0,
  
  // Network signal strength (1-100)
  networkStrength: 85,
  
  // Sensor readings (these will change gradually)
  sensors: {
    temperature: 25,      // Celsius
    humidity: 60,         // Percentage
    pm1: 15,             // Particulate Matter 1.0
    pm25: 35,            // Particulate Matter 2.5 (most important)
    pm10: 50,            // Particulate Matter 10
    sound: 45,           // Decibels
    voc: 30              // Volatile Organic Compounds
  }
};

// ============================================
// MQTT CLIENT SETUP
// ============================================

console.log('===========================================');
console.log('AIR PURIFIER DEVICE SIMULATOR STARTING...');
console.log('===========================================');
console.log(`Device ID: ${CONFIG.deviceId}`);
console.log(`Broker URL: ${CONFIG.brokerUrl}`);
console.log('-------------------------------------------\n');

// Connect to MQTT broker (like connecting to the post office)
const client = mqtt.connect(CONFIG.brokerUrl, {
  clientId: `device_${CONFIG.deviceId}_${Date.now()}`,
  clean: true,
  reconnectPeriod: 5000, // Try to reconnect every 5 seconds if disconnected
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate gradual sensor value changes (no sudden jumps)
 * This makes the data more realistic - real sensors don't jump from 20 to 80 instantly
 * 
 * @param {number} currentValue - Current sensor reading
 * @param {number} min - Minimum possible value
 * @param {number} max - Maximum possible value
 * @returns {number} New sensor value
 */
function generateGradualValue(currentValue, min = 1, max = 100) {
  // Maximum change per reading (±5 units)
  const maxChange = 5;
  
  // Random change between -5 and +5
  const change = (Math.random() * maxChange * 2) - maxChange;
  
  // Apply change and keep within bounds
  let newValue = currentValue + change;
  
  // Make sure value stays between min and max
  newValue = Math.max(min, Math.min(max, newValue));
  
  // Round to 2 decimal places
  return Math.round(newValue * 100) / 100;
}

/**
 * Update all sensor readings with gradual changes
 */
function updateSensorReadings() {
  deviceState.sensors.temperature = generateGradualValue(deviceState.sensors.temperature, 15, 35);
  deviceState.sensors.humidity = generateGradualValue(deviceState.sensors.humidity, 30, 90);
  deviceState.sensors.pm1 = generateGradualValue(deviceState.sensors.pm1, 1, 50);
  deviceState.sensors.pm25 = generateGradualValue(deviceState.sensors.pm25, 1, 100);
  deviceState.sensors.pm10 = generateGradualValue(deviceState.sensors.pm10, 1, 150);
  deviceState.sensors.sound = generateGradualValue(deviceState.sensors.sound, 30, 70);
  deviceState.sensors.voc = generateGradualValue(deviceState.sensors.voc, 1, 100);
  deviceState.networkStrength = generateGradualValue(deviceState.networkStrength, 50, 100);
}

/**
 * Publish sensor data to MQTT broker
 * This is like sending a health report to the backend
 */
function publishSensorData() {
  // Only publish if device is powered on
  if (!deviceState.powerOn) {
    console.log('[DEVICE] Device is OFF - not publishing data');
    return;
  }
  
  // Update sensor readings with gradual changes
  updateSensorReadings();
  
  // Create data packet to send
  const dataPacket = {
    deviceId: CONFIG.deviceId,
    timestamp: new Date().toISOString(),
    networkStrength: deviceState.networkStrength,
    fanSpeed: deviceState.fanSpeed,
    powerOn: deviceState.powerOn,
    ...deviceState.sensors
  };
  
  // Publish to MQTT topic
  const topic = CONFIG.topics.data(CONFIG.deviceId);
  
  client.publish(topic, JSON.stringify(dataPacket), { qos: 1 }, (err) => {
    if (err) {
      console.error('[ERROR] Failed to publish sensor data:', err.message);
    } else {
      console.log('[PUBLISHED] Sensor data sent to backend');
      console.log(`  Temperature: ${dataPacket.temperature}°C`);
      console.log(`  Humidity: ${dataPacket.humidity}%`);
      console.log(`  PM2.5: ${dataPacket.pm25}`);
      console.log(`  Fan Speed: ${dataPacket.fanSpeed}`);
      console.log(`  Power: ${dataPacket.powerOn ? 'ON' : 'OFF'}`);
      console.log('-------------------------------------------\n');
    }
  });
}

/**
 * Send acknowledgment back to backend
 * This confirms that the device received and executed a command
 * 
 * @param {string} commandId - ID of the command being acknowledged
 * @param {string} status - 'success' or 'error'
 * @param {string} message - Description of what happened
 */
function sendAcknowledgment(commandId, status, message) {
  const ackPacket = {
    deviceId: CONFIG.deviceId,
    commandId: commandId,
    status: status,
    message: message,
    timestamp: new Date().toISOString(),
    currentState: {
      powerOn: deviceState.powerOn,
      fanSpeed: deviceState.fanSpeed
    }
  };
  
  const topic = CONFIG.topics.ack(CONFIG.deviceId);
  
  client.publish(topic, JSON.stringify(ackPacket), { qos: 1 }, (err) => {
    if (err) {
      console.error('[ERROR] Failed to send acknowledgment:', err.message);
    } else {
      console.log(`[ACK SENT] ${status.toUpperCase()} - ${message}\n`);
    }
  });
}

/**
 * Handle incoming commands from backend
 * 
 * @param {Object} command - Command object from backend
 */
function handleCommand(command) {
  console.log('[COMMAND RECEIVED]', JSON.stringify(command, null, 2));
  
  const { commandId, action, value } = command;
  
  try {
    switch (action) {
      case 'setFanSpeed':
        // Validate fan speed (must be 0-5)
        if (value < 0 || value > 5) {
          throw new Error(`Invalid fan speed: ${value}. Must be between 0 and 5.`);
        }
        
        // Update device state
        deviceState.fanSpeed = value;
        deviceState.powerOn = value > 0; // If fan speed > 0, device is on
        
        console.log(`[DEVICE] Fan speed changed to: ${value}`);
        sendAcknowledgment(commandId, 'success', `Fan speed set to ${value}`);
        break;
      
      case 'turnOff':
        // Turn off the device
        deviceState.powerOn = false;
        deviceState.fanSpeed = 0;
        
        console.log('[DEVICE] Device turned OFF');
        sendAcknowledgment(commandId, 'success', 'Device turned off');
        break;
      
      case 'turnOn':
        // Turn on the device with default fan speed
        deviceState.powerOn = true;
        deviceState.fanSpeed = value || 2; // Default to speed 2 if not specified
        
        console.log(`[DEVICE] Device turned ON with fan speed ${deviceState.fanSpeed}`);
        sendAcknowledgment(commandId, 'success', `Device turned on with fan speed ${deviceState.fanSpeed}`);
        break;
      
      default:
        throw new Error(`Unknown command action: ${action}`);
    }
  } catch (error) {
    console.error('[ERROR] Command execution failed:', error.message);
    sendAcknowledgment(commandId, 'error', error.message);
  }
}

// ============================================
// MQTT EVENT HANDLERS
// ============================================

// When connected to MQTT broker
client.on('connect', () => {
  console.log('[CONNECTED] Successfully connected to MQTT broker\n');
  
  // Subscribe to command topic to receive commands from backend
  const commandTopic = CONFIG.topics.command(CONFIG.deviceId);
  
  client.subscribe(commandTopic, { qos: 1 }, (err) => {
    if (err) {
      console.error('[ERROR] Failed to subscribe to command topic:', err.message);
    } else {
      console.log(`[SUBSCRIBED] Listening for commands on: ${commandTopic}\n`);
    }
  });
  
  // Start publishing sensor data every 2 minutes
  console.log('[STARTING] Sensor data publishing (every 2 minutes)');
  console.log('===========================================\n');
  
  // Publish immediately on startup
  publishSensorData();
  
  // Then publish every 2 minutes
  setInterval(publishSensorData, CONFIG.dataPublishInterval);
});

// When a message is received
client.on('message', (topic, message) => {
  try {
    // Parse the JSON message
    const command = JSON.parse(message.toString());
    
    // Handle the command
    handleCommand(command);
  } catch (error) {
    console.error('[ERROR] Failed to parse command:', error.message);
  }
});

// When connection is lost
client.on('offline', () => {
  console.log('[OFFLINE] Lost connection to MQTT broker. Attempting to reconnect...\n');
});

// When reconnected
client.on('reconnect', () => {
  console.log('[RECONNECTING] Attempting to reconnect to MQTT broker...\n');
});

// When there's an error
client.on('error', (error) => {
  console.error('[ERROR] MQTT Client Error:', error.message);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

// Handle Ctrl+C to gracefully shutdown
process.on('SIGINT', () => {
  console.log('\n\n[SHUTDOWN] Stopping device simulator...');
  
  // Send final status before disconnecting
  if (client.connected) {
    const finalPacket = {
      deviceId: CONFIG.deviceId,
      timestamp: new Date().toISOString(),
      status: 'offline',
      message: 'Device simulator stopped'
    };
    
    client.publish(
      CONFIG.topics.data(CONFIG.deviceId),
      JSON.stringify(finalPacket),
      { qos: 1 },
      () => {
        client.end();
        console.log('[SHUTDOWN] Device simulator stopped successfully');
        process.exit(0);
      }
    );
  } else {
    process.exit(0);
  }
});

