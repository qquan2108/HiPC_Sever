const mongoose = require('mongoose');

// Schema cho specification
const specSchema = new mongoose.Schema({
  key:   { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true }
}, { _id: false });

// Schema chính
const productSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  category_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  price:          { type: Number, required: true, min: 0 },
  description:    { type: String, default: '' },
  stock:          { type: Number, default: 0, min: 0 },
  image:          { type: Object, default: '' },
  specifications: { type: [specSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);