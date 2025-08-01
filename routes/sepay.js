// routes/sepay.js
const express = require('express');
const router  = express.Router();

router.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    console.log('Webhook SePay:', data);

    // Tìm đơn theo description hoặc id truyền kèm (tuỳ bạn gửi gì vào "des")
    const orderId = data.description || data.orderId || data.id;
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
