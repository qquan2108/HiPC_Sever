const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');

const VariantproductSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:           { type: String, required: true, trim: true },
  price:          { type: Number, required: true, min: 0 },
  stock:          { type: Number, default: 0, min: 0 }
  
}, { timestamps: true });

VariantproductSchema.plugin(softDelete);

module.exports = mongoose.model('VariantProduct', VariantproductSchema);