const mongoose = require('mongoose');
const VariantproductSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:           { type: String, required: true, trim: true },
  price:          { type: Number, required: true, min: 0 },
  stock:          { type: Number, default: 0, min: 0 }
  
}, { timestamps: true });

module.exports = mongoose.model('VariantProduct', VariantproductSchema);