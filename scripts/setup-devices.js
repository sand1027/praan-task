#!/usr/bin/env node

/**
 * Device Setup Script
 * 
 * This script registers multiple devices in the database
 * Run: node scripts/setup-devices.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('../src/backend/models/Device');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/praan-iot';

const devices = [
  {
    deviceId: 'AIR_PURIFIER_001',
    name: 'Living Room Air Purifier',
    type: 'AIR_PURIFIER',
    location: {
      room: 'Living Room',
      building: 'Main House',
      floor: 'Ground Floor'
    },
    specifications: {
      model: 'AP-2000X',
      manufacturer: 'Praan',
      maxFanSpeed: 5,
      powerRating: 45,
      coverage: 500
    },
    owner: {
      userId: 'user_001',
      organizationId: 'org_001'
    }
  },
  {
    deviceId: 'LIVING_ROOM_001',
    name: 'Living Room Premium Purifier',
    type: 'AIR_PURIFIER',
    location: {
      room: 'Living Room',
      building: 'Main House',
      floor: 'Ground Floor'
    },
    specifications: {
      model: 'AP-3000X',
      manufacturer: 'Praan',
      maxFanSpeed: 5,
      powerRating: 60,
      coverage: 800
    },
    owner: {
      userId: 'user_001',
      organizationId: 'org_001'
    }
  },
  {
    deviceId: 'BEDROOM_002',
    name: 'Master Bedroom Air Purifier',
    type: 'AIR_PURIFIER',
    location: {
      room: 'Master Bedroom',
      building: 'Main House',
      floor: 'First Floor'
    },
    specifications: {
      model: 'AP-1500X',
      manufacturer: 'Praan',
      maxFanSpeed: 4,
      powerRating: 35,
      coverage: 300
    },
    owner: {
      userId: 'user_001',
      organizationId: 'org_001'
    }
  },
  {
    deviceId: 'KITCHEN_003',
    name: 'Kitchen Air Purifier',
    type: 'AIR_PURIFIER',
    location: {
      room: 'Kitchen',
      building: 'Main House',
      floor: 'Ground Floor'
    },
    specifications: {
      model: 'AP-1000X',
      manufacturer: 'Praan',
      maxFanSpeed: 3,
      powerRating: 25,
      coverage: 200
    },
    owner: {
      userId: 'user_001',
      organizationId: 'org_001'
    }
  }
];

async function setupDevices() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('🏠 Setting up devices...');
    
    for (const deviceData of devices) {
      try {
        const existingDevice = await Device.findOne({ deviceId: deviceData.deviceId });
        
        if (existingDevice) {
          console.log(`⚠️  Device ${deviceData.deviceId} already exists - skipping`);
          continue;
        }

        const device = new Device(deviceData);
        await device.save();
        
        console.log(`✅ Registered: ${deviceData.deviceId} (${deviceData.name})`);
      } catch (error) {
        console.error(`❌ Failed to register ${deviceData.deviceId}:`, error.message);
      }
    }

    console.log('\n🎉 Device setup completed!');
    
    const allDevices = await Device.find({}).sort({ deviceId: 1 });
    console.log('\n📋 Available devices:');
    allDevices.forEach(device => {
      console.log(`   • ${device.deviceId} - ${device.name} (${device.location.room})`);
    });

    console.log('\n🚀 You can now run simulators:');
    console.log('   npm run simulator              # AIR_PURIFIER_001');
    console.log('   npm run simulator:living       # LIVING_ROOM_001');
    console.log('   npm run simulator:bedroom      # BEDROOM_002');
    console.log('   npm run simulator:kitchen      # KITCHEN_003');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

setupDevices();