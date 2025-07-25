const mongoose = require('mongoose');

// Lịch sử thay đổi status
const statusHistorySchema = new mongoose.Schema({
  status:    { type: String, required: true },
  changedAt: { type: Date,   default: Date.now }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  build_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Build' },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity:  { type: Number, default: 1 },
      variant: {
        key:       { type: String, required: true },  // nhóm biến thể, ví dụ "RAM"
        label:     { type: String, required: true },  // tên option, ví dụ "32GB"
        priceDiff: { type: Number, required: true }   // chênh lệch giá lúc chọn
      }
    }
  ],
  status: {
    type: String,
    enum: [
      'pending',          // chờ xác nhận
      'packed',           // chờ lấy hàng
      'shipping',         // chờ giao hàng
      'delivered',        // đã giao
      'return_requested', // trả hàng
      'cancelled'         // đã hủy
    ],
    default: 'pending',
    required: true
  },
  statusHistory:    [statusHistorySchema],
  total_price:      Number,
  order_date:       { type: Date, default: Date.now },
  address:          String,
  paymentMethod:    String,
  shippingMethod:   String,
  voucher:          { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
  total:            { type: Number, default: 0 },
  cancelledAt:      Date
}, { timestamps: true });

// Tự động ghi lịch sử status mỗi khi thay đổi
orderSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push({ status: this.status, changedAt: new Date() });
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
