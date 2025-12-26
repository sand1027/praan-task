#!/bin/bash

# Comprehensive Test Script
# Tests all functionality including error cases

echo "=========================================="
echo "Praan IoT Backend - Comprehensive Tests"
echo "=========================================="
echo ""

API="http://localhost:3000"
DEVICE_ID="AIR_PURIFIER_001"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_count=0
pass_count=0
fail_count=0

# Test function
run_test() {
    test_count=$((test_count + 1))
    echo ""
    echo "Test $test_count: $1"
    echo "---"
}

pass_test() {
    pass_count=$((pass_count + 1))
    echo -e "${GREEN}✓ PASS${NC}: $1"
}

fail_test() {
    fail_count=$((fail_count + 1))
    echo -e "${RED}✗ FAIL${NC}: $1"
}

# Check if server is running
echo "Checking if backend server is running..."
if curl -s "$API/health" > /dev/null; then
    echo -e "${GREEN}✓ Backend is running${NC}"
else
    echo -e "${RED}✗ Backend is not running${NC}"
    echo "Please start the backend server first: npm start"
    exit 1
fi

echo ""
echo "=========================================="
echo "Starting Tests..."
echo "=========================================="

# TEST 1: Health Check
run_test "Health Check"
response=$(curl -s "$API/health")
if echo "$response" | grep -q "ok"; then
    pass_test "Health check returned OK"
else
    fail_test "Health check failed"
fi

# TEST 2: Get Device State
run_test "Get Device State"
response=$(curl -s "$API/device/$DEVICE_ID/state")
if echo "$response" | grep -q "success"; then
    pass_test "Device state retrieved"
else
    fail_test "Failed to get device state"
fi

# TEST 3: Get Latest Sensor Data
run_test "Get Latest Sensor Data"
response=$(curl -s "$API/device/$DEVICE_ID/latest")
if echo "$response" | grep -q "temperature"; then
    pass_test "Sensor data retrieved"
else
    fail_test "No sensor data found (is simulator running?)"
fi

# TEST 4: Create Valid Schedule
run_test "Create Valid Schedule"
response=$(curl -s -X POST "$API/schedule" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\",
    \"day\": \"Monday\",
    \"startTime\": \"09:00\",
    \"endTime\": \"17:00\",
    \"fanSpeed\": 3
  }")
if echo "$response" | grep -q "success.*true"; then
    schedule_id=$(echo "$response" | grep -o '"scheduleId":"[^"]*' | cut -d'"' -f4)
    pass_test "Schedule created: $schedule_id"
else
    fail_test "Failed to create schedule"
fi

# TEST 5: Invalid Schedule (Missing Fields)
run_test "Invalid Schedule - Missing Fields (Error Handling)"
response=$(curl -s -X POST "$API/schedule" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\"
  }")
if echo "$response" | grep -q "error"; then
    pass_test "Correctly rejected invalid schedule"
else
    fail_test "Should have rejected invalid schedule"
fi

# TEST 6: Invalid Schedule (Bad Time Format)
run_test "Invalid Schedule - Bad Time Format (Error Handling)"
response=$(curl -s -X POST "$API/schedule" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\",
    \"day\": \"Monday\",
    \"startTime\": \"25:00\",
    \"endTime\": \"17:00\",
    \"fanSpeed\": 3
  }")
if echo "$response" | grep -q "error"; then
    pass_test "Correctly rejected bad time format"
else
    fail_test "Should have rejected bad time format"
fi

# TEST 7: Invalid Schedule (Bad Fan Speed)
run_test "Invalid Schedule - Fan Speed Out of Range (Error Handling)"
response=$(curl -s -X POST "$API/schedule" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\",
    \"day\": \"Monday\",
    \"startTime\": \"09:00\",
    \"endTime\": \"17:00\",
    \"fanSpeed\": 10
  }")
if echo "$response" | grep -q "error"; then
    pass_test "Correctly rejected invalid fan speed"
else
    fail_test "Should have rejected invalid fan speed"
fi

# TEST 8: Get Schedules
run_test "Get All Schedules"
response=$(curl -s "$API/schedule/$DEVICE_ID")
if echo "$response" | grep -q "success"; then
    pass_test "Retrieved schedules"
else
    fail_test "Failed to get schedules"
fi

# TEST 9: Start Pre-Clean
run_test "Start Pre-Clean"
response=$(curl -s -X POST "$API/preclean" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\",
    \"fanMode\": 5,
    \"duration\": 1
  }")
if echo "$response" | grep -q "success.*true"; then
    pass_test "Pre-clean started"
else
    fail_test "Failed to start pre-clean"
fi

# TEST 10: Invalid Pre-Clean (Bad Fan Mode)
run_test "Invalid Pre-Clean - Fan Mode Out of Range (Error Handling)"
response=$(curl -s -X POST "$API/preclean" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\",
    \"fanMode\": 10,
    \"duration\": 5
  }")
if echo "$response" | grep -q "error"; then
    pass_test "Correctly rejected invalid fan mode"
else
    fail_test "Should have rejected invalid fan mode"
fi

# TEST 11: Invalid Pre-Clean (Bad Duration)
run_test "Invalid Pre-Clean - Duration Out of Range (Error Handling)"
response=$(curl -s -X POST "$API/preclean" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\",
    \"fanMode\": 5,
    \"duration\": 100
  }")
if echo "$response" | grep -q "error"; then
    pass_test "Correctly rejected invalid duration"
else
    fail_test "Should have rejected invalid duration"
fi

# TEST 12: Get Pre-Clean Status
run_test "Get Pre-Clean Status"
response=$(curl -s "$API/preclean/status/$DEVICE_ID")
if echo "$response" | grep -q "success"; then
    pass_test "Retrieved pre-clean status"
else
    fail_test "Failed to get pre-clean status"
fi

# TEST 13: Get Sensor Data with Limit
run_test "Get Sensor Data with Limit"
response=$(curl -s "$API/device/$DEVICE_ID/data?limit=5")
if echo "$response" | grep -q "success"; then
    pass_test "Retrieved sensor data with limit"
else
    fail_test "Failed to get sensor data"
fi

# TEST 14: Get Device Statistics
run_test "Get Device Statistics"
response=$(curl -s "$API/device/$DEVICE_ID/statistics?hours=24")
if echo "$response" | grep -q "success"; then
    pass_test "Retrieved statistics"
else
    fail_test "Failed to get statistics (need more data)"
fi

# TEST 15: Get Command History
run_test "Get Command History"
response=$(curl -s "$API/device/$DEVICE_ID/commands?limit=10")
if echo "$response" | grep -q "success"; then
    pass_test "Retrieved command history"
else
    fail_test "Failed to get command history"
fi

# TEST 16: Invalid Endpoint (404)
run_test "Invalid Endpoint - 404 Error Handling"
response=$(curl -s "$API/invalid/endpoint")
if echo "$response" | grep -q "not found"; then
    pass_test "Correctly returned 404"
else
    fail_test "Should have returned 404"
fi

# TEST 17: Delete Schedule (if we created one)
if [ ! -z "$schedule_id" ]; then
    run_test "Delete Schedule"
    response=$(curl -s -X DELETE "$API/schedule/$schedule_id")
    if echo "$response" | grep -q "success"; then
        pass_test "Schedule deleted"
    else
        fail_test "Failed to delete schedule"
    fi
fi

# TEST 18: Get Non-Existent Device
run_test "Get Non-Existent Device (Error Handling)"
response=$(curl -s "$API/device/FAKE_DEVICE_999/state")
if echo "$response" | grep -q "not found"; then
    pass_test "Correctly handled non-existent device"
else
    fail_test "Should have returned error for non-existent device"
fi

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests: $test_count"
echo -e "${GREEN}Passed: $pass_count${NC}"
echo -e "${RED}Failed: $fail_count${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}Some tests failed. Check the output above.${NC}"
    exit 1
fi

