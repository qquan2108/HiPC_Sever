const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  discount_value: Number,
  description: String,
  code: String
});

module.exports = mongoose.model('Voucher', voucherSchema);