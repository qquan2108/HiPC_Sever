const mongoose = require('mongoose');

const imageSearchSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  image_url: String,
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  search_time: { type: Date, default: Date.now },
  confidence_score: Number,
  status: String
});

module.exports = mongoose.model('ImageSearch', imageSearchSchema);