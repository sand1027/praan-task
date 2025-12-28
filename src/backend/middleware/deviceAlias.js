/**
 * Device Alias Middleware
 * 
 * Maps hardcoded device IDs to current active device
 * This allows Postman to keep using AIR_PURIFIER_001 while testing other devices
 */

// Current active device for testing (can be changed)
let CURRENT_TEST_DEVICE = 'AIR_PURIFIER_001';

/**
 * Set current test device
 */
function setCurrentTestDevice(deviceId) {
  CURRENT_TEST_DEVICE = deviceId;
  console.log(`[ALIAS] Current test device set to: ${deviceId}`);
}

/**
 * Get current test device
 */
function getCurrentTestDevice() {
  return CURRENT_TEST_DEVICE;
}

/**
 * Middleware to replace hardcoded device ID with current test device
 */
function deviceAliasMiddleware(req, res, next) {
  // Only apply to specific hardcoded device ID
  const HARDCODED_ID = 'AIR_PURIFIER_001';
  
  // Replace in URL params
  if (req.params.deviceId === HARDCODED_ID) {
    req.params.deviceId = CURRENT_TEST_DEVICE;
    console.log(`[ALIAS] Redirected ${HARDCODED_ID} → ${CURRENT_TEST_DEVICE}`);
  }
  
  // Replace in request body
  if (req.body && req.body.deviceId === HARDCODED_ID) {
    req.body.deviceId = CURRENT_TEST_DEVICE;
    console.log(`[ALIAS] Redirected body ${HARDCODED_ID} → ${CURRENT_TEST_DEVICE}`);
  }
  
  next();
}

module.exports = {
  deviceAliasMiddleware,
  setCurrentTestDevice,
  getCurrentTestDevice
};