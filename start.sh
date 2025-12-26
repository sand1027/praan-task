#!/bin/bash

echo "=========================================="
echo "Starting Praan IoT System (Native)"
echo "=========================================="
echo ""

# Start MongoDB
echo "Starting MongoDB..."
brew services start mongodb-community 2>/dev/null || sudo systemctl start mongod 2>/dev/null || echo "Please start MongoDB manually"
echo "✓ MongoDB should be running on port 27017"

# Start Mosquitto MQTT
echo "Starting MQTT Broker..."
brew services start mosquitto 2>/dev/null || sudo systemctl start mosquitto 2>/dev/null || echo "Please start Mosquitto manually"
echo "✓ MQTT Broker should be running on port 1883"

echo ""
echo "=========================================="
echo "Services Started!"
echo "=========================================="
echo ""
echo "Now run these in separate terminals:"
echo ""
echo "Terminal 1: npm start"
echo "Terminal 2: npm run simulator"
echo ""
echo "To stop: ./stop.sh"
echo ""

