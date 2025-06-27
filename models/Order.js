// models/Order.js
const mongoose = require('mongoose');

// Sub-schema cho lịch sử trạng thái
const statusHistorySchema = new mongoose.Schema({
  status:    { type: String, required: true },
  changedAt: { type: Date,   default: Date.now }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity:  { type: Number, default: 1 }
    }
  ],
  status: {
    type: String,
    enum: [
      'pending','confirmed','packed','picked','shipping','delivered',
      'return_requested','return_approved','refunding','refunded',
      'cancelled','failed'
    ],
    default: 'pending',
    required: true
  },
  statusHistory: [statusHistorySchema],
  total_price:   Number,
  order_date:    { type: Date, default: Date.now },
  address:       String,
  paymentMethod: String,
  shippingMethod:String,
  voucher:       { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
  total:         Number,
  cancelledAt:   Date
}, { timestamps: true });

// Tự động ghi nhận lịch sử trạng thái khi status thay đổi
orderSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push({ status: this.status, changedAt: new Date() });
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
