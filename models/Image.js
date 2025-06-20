const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  description: String
});

module.exports = mongoose.model('Image', imageSchema);