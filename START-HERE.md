# 🚀 START HERE - Quick Setup

## Prerequisites
You need these running on your Mac:
1. **MongoDB** - Database
2. **Mosquitto** - MQTT Broker
3. **Node.js** - Already installed ✅

## Step 1: Start MongoDB

Open Terminal 1:
```bash
# If you have MongoDB installed
mongod

# If not installed, use Docker:
docker run -d -p 27017:27017 --name praan-mongo mongo:7.0
```

## Step 2: Start Mosquitto MQTT Broker

Open Terminal 2:
```bash
# If you have Mosquitto installed
mosquitto -c mosquitto/config/mosquitto.conf

# If not installed, use Docker:
docker run -d -p 1883:1883 --name praan-mqtt eclipse-mosquitto:2.0
```

## Step 3: Start Backend Server

Open Terminal 3:
```bash
cd /Users/sandeepv/Desktop/praan-task
npm start
```

You should see:
```
[INFO] Successfully connected to MongoDB
[INFO] Successfully connected to MQTT broker
[INFO] Backend server running on port 3000
```

## Step 4: Start Device Simulator

Open Terminal 4:
```bash
cd /Users/sandeepv/Desktop/praan-task
npm run simulator
```

You should see sensor data being published every 2 minutes:
```
[PUBLISHED] Sensor data sent to backend
  Temperature: 25.3°C
  Humidity: 61.2%
  PM2.5: 36.4
```

## Step 5: Test with Postman

1. Open Postman
2. Import: `postman/Praan-IoT-Backend.postman_collection.json`
3. Try these requests:
   - Health Check
   - Get Device State
   - Create Schedule
   - Start Pre-Clean

## Step 6: Open Frontend (Optional)

```bash
open frontend/index.html
```

## Quick Test

```bash
# Test health
curl http://localhost:3000/health

# Get device data
curl http://localhost:3000/api/device/AIR_PURIFIER_001/latest

# Create schedule
curl -X POST http://localhost:3000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "AIR_PURIFIER_001",
    "day": "Thursday",
    "startTime": "18:00",
    "endTime": "18:05",
    "fanSpeed": 4
  }'

# Start pre-clean
curl -X POST http://localhost:3000/api/preclean \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "AIR_PURIFIER_001",
    "fanMode": 5,
    "duration": 1
  }'
```

## Troubleshooting

**MongoDB not connecting?**
```bash
# Check if running
ps aux | grep mongod

# Start manually
mongod --dbpath ~/data/db
```

**Mosquitto not connecting?**
```bash
# Check if running
ps aux | grep mosquitto

# Start manually
mosquitto
```

**Port already in use?**
```bash
# Check what's using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>
```

## What to Watch

**Backend logs** - Shows data being received and stored
**Simulator logs** - Shows data being sent every 2 minutes
**Postman** - Test all APIs

## Error Handling

All error handling is in:
- `src/backend/services/mqttService.js` - Retry logic (lines 150-250)
- `src/backend/routes/*.js` - API validation
- `src/simulator/device-simulator.js` - Device error handling

Errors are logged to:
- Console (colored output)
- `logs/error.log` (errors only)
- `logs/combined.log` (everything)

