const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discount_type: { type: String, enum: ['percentage', 'fixed'], required: true }, // BẮT BUỘC
  discount_value: { type: Number, required: true },
  max_discount: { type: Number }, // Có thể không bắt buộc
  min_order_amount: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  description: { type: String },
  title: { type: String },
  start_date: { type: Date },
  end_date: { type: Date },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  used_count: { type: Number, default: 0 },
  // Thêm loại voucher
  apply_for: { 
    type: String, 
    enum: ['order', 'shipping'], // 'order' cho đơn hàng, 'shipping' cho phí vận chuyển
    default: 'order',
    required: true
  }
});

module.exports = mongoose.model('Voucher', VoucherSchema);