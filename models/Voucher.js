const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  discount_value: Number,
  description: String,
  code: String,
  start_date: Date,   // ngày áp dụng
  end_date: Date,
  min_order_amount: { type: Number, default: 0 }, // Số tiền tối thiểu
  quantity: { type: Number, default: 0 } // Số lượng còn lại
});

module.exports = mongoose.model('Voucher', voucherSchema);