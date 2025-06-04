const mongoose = require('mongoose');

const comparisonProductSchema = new mongoose.Schema({
  comparison_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Comparison' },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }
});

module.exports = mongoose.model('ComparisonProduct', comparisonProductSchema);