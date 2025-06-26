// models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity:  { type: Number, default: 1 }
    }
  ],
  // Thêm trường status để lưu trạng thái đơn
  status: {
    type: String,
    enum: ['pending','confirmed','shipping','delivered','returned','cancelled'],
    default: 'pending',
    required: true
  },
  total_price:   Number,
  order_date:    { type: Date, default: Date.now },
  address:       String,
  paymentMethod: String,
  shippingMethod:String,
  voucher:       { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
  total:         Number
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
