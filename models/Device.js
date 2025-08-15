const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  expoPushToken: { type: String, unique: true, required: true },
  platform: { type: String, enum: ['ios', 'android'], index: true },
  appVersion: String,
  locale: String,
  enabled: { type: Boolean, default: true },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Device', DeviceSchema);
