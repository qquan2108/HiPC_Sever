const { Expo } = require('expo-server-sdk');
const Device = require('../models/Device');

const expo = new Expo();

async function sendToAll({ title, message, data = {} }) {
  const devices = await Device.find({ enabled: true }).lean();
  const messages = [];

  for (const device of devices) {
    if (!Expo.isExpoPushToken(device.expoPushToken)) continue;
    messages.push({
      to: device.expoPushToken,
      sound: 'default',
      title,
      body: message,
      data,
      priority: device.platform === 'android' ? 'high' : 'default'
    });
  }

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('Expo push error:', err);
    }
  }
}

module.exports = { sendToAll };
