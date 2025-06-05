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
  order_date: { type: Date, default: Date.now },
  address: String, // Thêm trường này
  paymentMethod: String, // Thêm trường này
  shippingMethod: String, // Thêm trường này
  voucher: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null }, // Thêm trường này
  total: Number, // Thêm trường này (nếu muốn lưu tổng tiền cuối cùng)
  createdAt: { type: Date, default: Date.now } // Thêm trường này nếu muốn
});

module.exports = mongoose.model('Order', orderSchema);