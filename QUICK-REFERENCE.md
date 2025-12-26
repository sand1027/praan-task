# Quick Reference Guide

## 🚀 How to Start Everything

### Option 1: With Docker (If Docker is running)
```bash
cd /Users/sandeepv/Desktop/praan-task
docker-compose up -d
npm run simulator
```

### Option 2: Manual (Recommended for Mac)

**Terminal 1 - MongoDB:**
```bash
# If installed
mongod

# Or with Docker
docker run -d -p 27017:27017 --name praan-mongo mongo:7.0
```

**Terminal 2 - Mosquitto MQTT:**
```bash
# If installed
mosquitto

# Or with Docker
docker run -d -p 1883:1883 --name praan-mqtt eclipse-mosquitto:2.0
```

**Terminal 3 - Backend:**
```bash
cd /Users/sandeepv/Desktop/praan-task
npm start
```

**Terminal 4 - Device Simulator:**
```bash
cd /Users/sandeepv/Desktop/praan-task
npm run simulator
```

---

## 📍 Where Everything Is

### MQTT Broker
- **URL**: `mqtt://localhost:1883`
- **Topics**:
  - Data: `device/AIR_PURIFIER_001/data`
  - Commands: `device/AIR_PURIFIER_001/command`
  - Acks: `device/AIR_PURIFIER_001/ack`

### Backend API
- **URL**: `http://localhost:3000`
- **Health**: `http://localhost:3000/health`

### MongoDB
- **URL**: `mongodb://localhost:27017/praan-iot`
- **Database**: `praan-iot`
- **Collections**: `sensordatas`, `schedules`, `devicestates`, `commandlogs`

### Frontend
- **File**: `frontend/index.html`
- **Open**: `open frontend/index.html` (or double-click)

---

## 🧪 How to Test

### Quick Test
```bash
# Health check
curl http://localhost:3000/health

# Get device state
curl http://localhost:3000/api/device/AIR_PURIFIER_001/state

# Get latest sensor data
curl http://localhost:3000/api/device/AIR_PURIFIER_001/latest
```

### Full Test Suite
```bash
./test-all.sh
```

### Postman
1. Open Postman
2. Import: `postman/Praan-IoT-Backend.postman_collection.json`
3. Set variables:
   - `base_url`: `http://localhost:3000`
   - `device_id`: `AIR_PURIFIER_001`
4. Run requests

---

## 📊 How to See Output

### Backend Logs
Watch Terminal 3 (Backend) for:
```
[INFO] Received sensor data from device: AIR_PURIFIER_001
[INFO] Sensor data saved to database
```

### Device Simulator Logs
Watch Terminal 4 (Simulator) for:
```
[PUBLISHED] Sensor data sent to backend
  Temperature: 25.3°C
  Humidity: 61.2%
  PM2.5: 36.4
```

### MongoDB Data
```bash
# Connect to MongoDB
mongosh

# Use database
use praan-iot

# See sensor data
db.sensordatas.find().limit(5).pretty()

# See schedules
db.schedules.find().pretty()

# See device state
db.devicestates.find().pretty()

# See command logs
db.commandlogs.find().limit(10).pretty()
```

### Frontend Dashboard
Open `frontend/index.html` in browser to see:
- Animated fan (spins based on speed)
- Real-time sensor data
- Manual controls
- Schedule management

---

## 🎯 Quick API Examples

### Create Schedule
```bash
curl -X POST http://localhost:3000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "AIR_PURIFIER_001",
    "day": "Thursday",
    "startTime": "18:00",
    "endTime": "18:05",
    "fanSpeed": 4
  }'
```

### Start Pre-Clean
```bash
curl -X POST http://localhost:3000/api/preclean \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "AIR_PURIFIER_001",
    "fanMode": 5,
    "duration": 1
  }'
```

### Get Sensor Data
```bash
curl http://localhost:3000/api/device/AIR_PURIFIER_001/data?limit=10
```

### Get Schedules
```bash
curl http://localhost:3000/api/device/AIR_PURIFIER_001/schedules
```

---

## 🔍 Where Is Error Handling?

### Files with Error Handling:

1. **MQTT Service** (`src/backend/services/mqttService.js`)
   - Lines 150-250: Retry logic (3 attempts, 30s timeout)
   - Lines 50-100: Connection errors

2. **Schedule Routes** (`src/backend/routes/scheduleRoutes.js`)
   - Lines 30-80: Input validation
   - Lines 100-120: Database errors

3. **Pre-Clean Routes** (`src/backend/routes/precleanRoutes.js`)
   - Lines 30-70: Input validation
   - Lines 100-150: Device state errors

4. **Device Simulator** (`src/simulator/device-simulator.js`)
   - Lines 200-250: Command handling errors
   - Lines 300-350: MQTT connection errors

5. **Server** (`src/backend/server.js`)
   - Lines 50-80: Global error handlers
   - Lines 100-150: Database connection errors

**See ERROR-HANDLING.md for complete details**

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process if needed
kill -9 <PID>
```

### MongoDB not connecting
```bash
# Check if MongoDB is running
ps aux | grep mongod

# Start MongoDB
mongod --dbpath ~/data/db
```

### Mosquitto not connecting
```bash
# Check if Mosquitto is running
ps aux | grep mosquitto

# Start Mosquitto
mosquitto
```

### Device simulator not publishing
```bash
# Check MQTT broker is running
ps aux | grep mosquitto

# Check logs for errors
# Look for [ERROR] messages in simulator output
```

### No sensor data in API
```bash
# Make sure simulator is running
npm run simulator

# Wait 2 minutes for first data
# Check simulator logs for [PUBLISHED] messages
```

---

## 📁 Project Structure

```
praan-task/
├── src/
│   ├── backend/
│   │   ├── models/          # MongoDB schemas
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # MQTT, Scheduler
│   │   ├── utils/           # Logger
│   │   └── server.js        # Main server
│   └── simulator/
│       └── device-simulator.js  # Device simulator
├── frontend/
│   └── index.html           # Dashboard UI
├── postman/
│   └── Praan-IoT-Backend.postman_collection.json
├── aws/                     # AWS deployment
├── mosquitto/               # MQTT config
├── logs/                    # Application logs
├── START-HERE.md            # Setup guide
├── ERROR-HANDLING.md        # Error handling docs
├── test-all.sh              # Test suite
└── package.json             # Dependencies
```

---

## 🎨 Frontend Features

Open `frontend/index.html` to see:

1. **Animated Fan** - Spins based on current speed (0-5)
2. **Real-time Sensor Data** - Updates every 5 seconds
3. **Manual Controls** - Set fan speed directly
4. **Pre-Clean** - Temporary boost with duration
5. **Schedule Management** - Create/view/delete schedules
6. **Connection Status** - Shows if backend is connected

---

## ✅ Requirements Checklist

### Device Simulator ✅
- ✅ Publishes sensor data every 2 minutes
- ✅ 9 sensors (temp, humidity, PM1, PM2.5, PM10, sound, VOC, network, time)
- ✅ Gradual value changes (no sudden jumps)
- ✅ Command handling (setFanSpeed, turnOff)
- ✅ Updates internal state
- ✅ Sends acknowledgments

### Backend ✅
- ✅ Listens to MQTT topics
- ✅ Stores sensor data in MongoDB
- ✅ Schedule API (day, start, end, fan speed)
- ✅ Pre-Clean API (fan mode, duration)
- ✅ Retry logic (3 attempts if offline)
- ✅ Restores previous state after pre-clean

### Deliverables ✅
- ✅ GitHub repository ready
- ✅ IoT device simulator script
- ✅ Backend service
- ✅ MongoDB schemas (4 models)
- ✅ Postman collection
- ✅ Documentation (multiple files)
- ✅ Error handling (50+ handlers)
- ✅ Test suite (18 tests)
- ✅ Frontend dashboard (bonus)

---

## 📞 Quick Commands

```bash
# Install dependencies
npm install

# Start backend
npm start

# Start simulator
npm run simulator

# Run tests
./test-all.sh

# Check setup
./verify-setup.sh

# View logs
tail -f logs/combined.log
tail -f logs/error.log

# MongoDB shell
mongosh
use praan-iot
db.sensordatas.find().limit(5)

# Stop Docker containers
docker-compose down

# Clean everything
docker-compose down -v
rm -rf node_modules
npm install
```

---

## 🎯 What to Show Your Product Lead

1. **Start everything** (4 terminals)
2. **Open frontend** (`frontend/index.html`)
3. **Show real-time data** - Watch fan animation and sensor updates
4. **Create a schedule** - Use Postman or frontend
5. **Start pre-clean** - Watch fan speed change and restore
6. **Run tests** - `./test-all.sh` to show error handling
7. **Show logs** - Terminal output showing data flow
8. **Show MongoDB** - `mongosh` to show stored data

**Key Points:**
- ✅ All requirements met
- ✅ Production-grade error handling
- ✅ Comprehensive testing
- ✅ Clean, documented code
- ✅ Working frontend dashboard
- ✅ AWS deployment ready

---

**Everything is ready to run and demo!**

