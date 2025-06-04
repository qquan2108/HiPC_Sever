const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  price: { type: Number, required: true },
  description: String,
  stock: Number,
  specifications: String
});

module.exports = mongoose.model('Product', productSchema);