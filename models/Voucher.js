const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  discount_value: Number,
  description: String,
  code: String,
    start_date: Date,   // ngày áp dụng
  end_date: Date  
});

module.exports = mongoose.model('Voucher', voucherSchema);