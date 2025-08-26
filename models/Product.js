const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  category_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  price:          { type: Number, default: 0, min: 0 },
  description:    { type: String, default: '' },
  image:          { type: Object, default: '' },
  specifications: { type: [{ key: String, value: String }], default: [] },
  rating:         { type: Number, default: 0 },        // Thêm dòng này
  reviewCount:    { type: Number, default: 0 },        // Thêm dòng này
  isDisabled:     { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
