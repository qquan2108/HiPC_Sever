const mongoose = require('mongoose');

const comboSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }],
  price:      { type: Number, required: true, min: 0 }, // tổng giá combo hoặc giá giảm
  image:      { type: String }, // ảnh đại diện cho combo
  createdAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Combo', comboSchema);
