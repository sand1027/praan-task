const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const logger = require('../utils/logger');

/**
 * Register a new device
 */
router.post('/register', async (req, res) => {
  try {
    const {
      deviceId,
      name,
      type,
      location,
      specifications,
      owner
    } = req.body;

    // Check if device already exists
    const existingDevice = await Device.findOne({ deviceId });
    if (existingDevice) {
      return res.status(400).json({
        success: false,
        message: 'Device with this ID already exists'
      });
    }

    // Create new device
    const device = new Device({
      deviceId,
      name,
      type,
      location,
      specifications,
      owner
    });

    await device.save();
    logger.info(`Device registered: ${deviceId}`);

    res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      data: device
    });

  } catch (error) {
    logger.error('Error registering device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register device',
      error: error.message
    });
  }
});

/**
 * Get all devices
 */
router.get('/', async (req, res) => {
  try {
    const { status, type, organizationId } = req.query;
    
    let filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (organizationId) filter['owner.organizationId'] = organizationId;

    const devices = await Device.find(filter).sort({ registeredAt: -1 });

    res.json({
      success: true,
      count: devices.length,
      data: devices
    });

  } catch (error) {
    logger.error('Error fetching devices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch devices',
      error: error.message
    });
  }
});

/**
 * Get device by ID
 */
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    res.json({
      success: true,
      data: device
    });

  } catch (error) {
    logger.error('Error fetching device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device',
      error: error.message
    });
  }
});

/**
 * Update device information
 */
router.put('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const updates = req.body;

    // Don't allow deviceId to be changed
    delete updates.deviceId;

    const device = await Device.findOneAndUpdate(
      { deviceId },
      updates,
      { new: true, runValidators: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    logger.info(`Device updated: ${deviceId}`);

    res.json({
      success: true,
      message: 'Device updated successfully',
      data: device
    });

  } catch (error) {
    logger.error('Error updating device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update device',
      error: error.message
    });
  }
});

/**
 * Delete device
 */
router.delete('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const device = await Device.findOneAndDelete({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    logger.info(`Device deleted: ${deviceId}`);

    res.json({
      success: true,
      message: 'Device deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete device',
      error: error.message
    });
  }
});

/**
 * Get active devices only
 */
router.get('/status/active', async (req, res) => {
  try {
    const devices = await Device.getActiveDevices();

    res.json({
      success: true,
      count: devices.length,
      data: devices
    });

  } catch (error) {
    logger.error('Error fetching active devices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active devices',
      error: error.message
    });
  }
});

/**
 * Get device configuration for simulator
 */
router.get('/:deviceId/config', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    // Return configuration needed by simulator
    res.json({
      success: true,
      data: {
        deviceId: device.deviceId,
        name: device.name,
        type: device.type,
        maxFanSpeed: device.specifications.maxFanSpeed,
        location: device.location,
        mqttTopics: {
          data: `device/${device.deviceId}/data`,
          command: `device/${device.deviceId}/command`,
          ack: `device/${device.deviceId}/ack`
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching device config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device config',
      error: error.message
    });
  }
});

module.exports = router;