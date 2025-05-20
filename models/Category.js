const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  description: String
});

module.exports = mongoose.model('Category', categorySchema);