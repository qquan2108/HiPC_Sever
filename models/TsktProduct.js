const mongoose = require('mongoose');

const tsktProductSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  value: String
});

module.exports = mongoose.model('TsktProduct', tsktProductSchema);