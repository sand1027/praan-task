#!/bin/bash

# Setup Verification Script
# This script checks if all prerequisites are installed

echo "=========================================="
echo "Praan IoT Backend - Setup Verification"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check function
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $2 is installed"
        if [ ! -z "$3" ]; then
            echo "  Version: $($3)"
        fi
        return 0
    else
        echo -e "${RED}✗${NC} $2 is NOT installed"
        echo -e "  ${YELLOW}Install from: $4${NC}"
        return 1
    fi
}

# Check Node.js
echo "Checking prerequisites..."
echo ""

check_command "node" "Node.js" "node --version" "https://nodejs.org/"
NODE_CHECK=$?

# Check npm
check_command "npm" "npm" "npm --version" "https://nodejs.org/"
NPM_CHECK=$?

# Check MongoDB
check_command "mongosh" "MongoDB" "mongosh --version" "https://www.mongodb.com/try/download/community"
MONGO_CHECK=$?

# Check Mosquitto
check_command "mosquitto" "Mosquitto MQTT Broker" "mosquitto -h | head -n 1" "https://mosquitto.org/download/"
MQTT_CHECK=$?

# Check Docker (optional)
echo ""
echo "Optional (for Docker deployment):"
check_command "docker" "Docker" "docker --version" "https://www.docker.com/get-started"
DOCKER_CHECK=$?

check_command "docker-compose" "Docker Compose" "docker-compose --version" "https://docs.docker.com/compose/install/"
COMPOSE_CHECK=$?

echo ""
echo "=========================================="

# Summary
REQUIRED_CHECKS=$((NODE_CHECK + NPM_CHECK + MONGO_CHECK + MQTT_CHECK))

if [ $REQUIRED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}✓ All required prerequisites are installed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: npm install"
    echo "2. Run: cp env.example .env"
    echo "3. Start MongoDB: mongod"
    echo "4. Start Mosquitto: mosquitto -c mosquitto/config/mosquitto.conf"
    echo "5. Start Backend: npm start"
    echo "6. Start Simulator: npm run simulator"
    echo ""
    echo "Or use Docker Compose:"
    echo "  docker-compose up -d"
    echo "  npm run simulator"
else
    echo -e "${RED}✗ Some required prerequisites are missing${NC}"
    echo ""
    echo "Please install missing prerequisites and run this script again."
fi

echo "=========================================="
echo ""

# Check if dependencies are installed
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} Node modules are installed"
else
    echo -e "${YELLOW}!${NC} Node modules not installed. Run: npm install"
fi

# Check if .env exists
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
else
    echo -e "${YELLOW}!${NC} .env file not found. Run: cp env.example .env"
fi

echo ""

