// routes/sepay.js
const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');

router.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    console.log('Webhook SePay:', data);

    // Tách ObjectId từ description nếu có dạng "BankAPINotify <ObjectId>"
    let orderId = data.description || data.orderId || data.id;
    if (typeof orderId === 'string') {
      // Tìm chuỗi 24 ký tự hex trong description
      const match = orderId.match(/[a-f\d]{24}/i);
      if (match) orderId = match[0];
    }

    // Kiểm tra ObjectId hợp lệ
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'orderId không hợp lệ' });
    }

    const order = await Order.findById(orderId);

    if (order && order.status === 'pending') {
      order.status = 'packed';       // đã thanh toán → chờ lấy hàng
      order.paymentMethod = 'VietQR';
      await order.save();

      // Emit sự kiện qua Socket.IO
      const io = req.app.get('io');
      io.emit('payment_success', {
        orderId: order._id,
        amount: data.transferAmount,
        account: data.accountNumber,
        transactionDate: data.transactionDate
      });
    }

    res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
