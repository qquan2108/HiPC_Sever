const mongoose = require('mongoose');

const buildProductSchema = new mongoose.Schema({
  build_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Build' },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: Number,
  added_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BuildProduct', buildProductSchema);