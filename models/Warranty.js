const mongoose = require('mongoose');

const warrantySchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  start_date: Date,
  end_date: Date
});

module.exports = mongoose.model('Warranty', warrantySchema);