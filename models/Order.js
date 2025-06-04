const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  build_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Build' },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, default: 1 }
    }
  ],
  total_price: Number,
  order_date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);