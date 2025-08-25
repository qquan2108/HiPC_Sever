const mongoose = require('mongoose');

const comboSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }],
  variants:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'VariantProduct' }], // Thêm trường này
  price:      { type: Number, required: true, min: 0 },
  image:      { type: String },
  createdAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Combo', comboSchema);
