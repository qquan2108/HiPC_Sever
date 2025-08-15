const router = require('express').Router();
const Device = require('../models/Device');

// Register or update device push token
router.post('/register-device', async (req, res) => {
  const { userId, expoPushToken, platform, appVersion, locale } = req.body;
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken[')) {
    return res.status(400).json({ error: 'Invalid Expo push token' });
  }
  try {
    const device = await Device.findOneAndUpdate(
      { expoPushToken },
      { userId, platform, appVersion, locale, enabled: true, lastSeenAt: new Date() },
      { new: true, upsert: true }
    );
    res.json({ ok: true, deviceId: device._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
