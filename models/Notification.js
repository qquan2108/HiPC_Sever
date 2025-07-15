const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['success','info','warning','danger'],
    required: true
  },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  isRead:  { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Thêm trường này
  relatedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // Thêm trường này để liên kết với đơn hàng
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
