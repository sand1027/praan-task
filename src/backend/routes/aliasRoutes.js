const express = require('express');
const router = express.Router();
const { setCurrentTestDevice, getCurrentTestDevice } = require('../middleware/deviceAlias');

/**
 * Get current test device
 */
router.get('/current', (req, res) => {
  res.json({
    success: true,
    currentTestDevice: getCurrentTestDevice(),
    message: `Postman requests to AIR_PURIFIER_001 will be redirected to ${getCurrentTestDevice()}`
  });
});

/**
 * Set current test device
 */
router.post('/set/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  
  setCurrentTestDevice(deviceId);
  
  res.json({
    success: true,
    message: `Test device changed to ${deviceId}`,
    currentTestDevice: deviceId,
    note: 'All Postman requests to AIR_PURIFIER_001 will now go to this device'
  });
});

module.exports = router;