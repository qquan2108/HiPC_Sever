const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  imageUrl:  { type: String, required: true },
  link:      { type: String },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Banner', bannerSchema);
