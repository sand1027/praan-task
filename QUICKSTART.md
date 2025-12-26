# Quick Start Guide

Get the Praan IoT Backend running in 5 minutes!

## Prerequisites Check

Before starting, verify you have these installed:

```bash
# Check Node.js (need v18+)
node --version

# Check MongoDB
mongosh --version

# Check Mosquitto
mosquitto -h
```

If any are missing, see [README.md](README.md#prerequisites) for installation instructions.

---

## Option 1: Docker Compose (Easiest)

### Step 1: Start Everything

```bash
# Clone and enter directory
cd praan-task

# Start all services (MongoDB, Mosquitto, Backend)
docker-compose up -d
```

### Step 2: Start Device Simulator

```bash
# In a new terminal
npm run simulator
```

### Step 3: Test the System

```bash
# Check health
curl http://localhost:3000/health

# Should see:
# {"status":"ok","services":{"mongodb":"connected","mqtt":"connected"}}
```

### Step 4: Use Postman

1. Open Postman
2. Import `postman/Praan-IoT-Backend.postman_collection.json`
3. Try the "Health Check" request
4. Try "Get Device State"
5. Try "Create Schedule"

**Done!** The system is running.

---

## Option 2: Manual Setup

### Step 1: Install Dependencies

```bash
cd praan-task
npm install
```

### Step 2: Configure Environment

```bash
# Copy example environment file
cp env.example .env

# Edit .env if needed (defaults should work)
```

### Step 3: Start Services

**Terminal 1 - MongoDB:**
```bash
mongod
```

**Terminal 2 - Mosquitto:**
```bash
mosquitto -c mosquitto/config/mosquitto.conf
```

**Terminal 3 - Backend:**
```bash
npm start
```

**Terminal 4 - Device Simulator:**
```bash
npm run simulator
```

### Step 4: Verify

```bash
# In a new terminal
curl http://localhost:3000/health
```

---

## What to Do Next

### 1. Watch the Logs

**Device Simulator** should show:
```
[PUBLISHED] Sensor data sent to backend
  Temperature: 25.3°C
  Humidity: 61.2%
  PM2.5: 36.4
  Fan Speed: 2
  Power: ON
```

**Backend** should show:
```
[INFO] Received sensor data from device: AIR_PURIFIER_001
[INFO] Sensor data saved to database
```

### 2. Create a Schedule

Open Postman and send this request:

**POST** `http://localhost:3000/api/schedule`

```json
{
  "deviceId": "AIR_PURIFIER_001",
  "day": "Thursday",
  "startTime": "14:30",
  "endTime": "14:35",
  "fanSpeed": 4
}
```

Change "Thursday" and times to match current day/time (a few minutes from now).

Watch the device simulator logs when the time comes!

### 3. Try Pre-Clean

**POST** `http://localhost:3000/api/preclean`

```json
{
  "deviceId": "AIR_PURIFIER_001",
  "fanMode": 5,
  "duration": 1
}
```

Watch the device simulator:
- Fan speed should jump to 5
- After 1 minute, it should restore to previous speed

### 4. View Sensor Data

**GET** `http://localhost:3000/api/device/AIR_PURIFIER_001/data?limit=10`

You'll see the last 10 sensor readings!

### 5. Check Device State

**GET** `http://localhost:3000/api/device/AIR_PURIFIER_001/state`

Shows current fan speed, power status, and latest sensor values.

---

## Common Issues

### "ECONNREFUSED" Error

**Problem**: Can't connect to MongoDB or Mosquitto

**Solution**: Make sure MongoDB and Mosquitto are running
```bash
# Check MongoDB
mongosh

# Check Mosquitto
ps aux | grep mosquitto
```

### Device Simulator Not Publishing

**Problem**: No sensor data appearing

**Solution**: 
1. Check MQTT broker is running
2. Check device simulator logs for errors
3. Verify MQTT_BROKER_URL in .env

### Backend Won't Start

**Problem**: Backend crashes on startup

**Solution**:
1. Check MongoDB is running
2. Check port 3000 is not in use: `lsof -i :3000`
3. Check logs in `logs/error.log`

---

## Stopping the System

### Docker Compose

```bash
docker-compose down
```

### Manual

Press `Ctrl+C` in each terminal window.

---

## Next Steps

1. Read [README.md](README.md) for detailed documentation
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
3. Explore all API endpoints in Postman
4. Try the AWS deployment guide

---

**Need Help?** Check the [Troubleshooting](README.md#troubleshooting) section in README.md

