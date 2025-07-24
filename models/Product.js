const mongoose = require('mongoose');

// Schema cho từng option của một biến thể
const variantOptionSchema = new mongoose.Schema({
  label:     { type: String, required: true, trim: true },   // tên biến thể, ví dụ "32GB"
  priceDiff: { type: Number, required: true, default: 0 }    // chênh lệch so với price gốc
}, { _id: false });

// Schema cho nhóm biến thể (nếu có nhiều nhóm, ví dụ "RAM", "Color")
const variantGroupSchema = new mongoose.Schema({
  key:     { type: String, required: true, trim: true },    // ví dụ "RAM"
  options: { type: [variantOptionSchema], default: [] }     // mảng các option
}, { _id: false });

// Schema chính Product
const productSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  category_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  price:          { type: Number, required: true, min: 0 },  // giá gốc
  description:    { type: String, default: '' },
  stock:          { type: Number, default: 0, min: 0 },
  image:          { type: Object, default: '' },
  specifications: { type: [{ key: String, value: String }], default: [] },
  variants:       { type: [variantGroupSchema], default: [] } // mảng nhóm biến thể
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
