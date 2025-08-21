// models/Preset.js
const mongoose = require('mongoose');

const presetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: String,
  comboIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Combo' }],
  image: String, // <-- Thêm dòng này
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Preset', presetSchema);