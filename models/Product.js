const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  description: String,
  image_url: String,
  stock: Number,
  brand: String,
  specifications: String
});

module.exports = mongoose.model('Product', productSchema);