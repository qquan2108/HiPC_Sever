// routes/sepay.js
const express = require('express');
const router  = express.Router();

router.post('/webhook', (req, res) => {
  const data = req.body;
  console.log('Webhook SePay:', data);

  // TODO: nếu cần lưu DB → lưu orderId, trạng thái “paid”

  // Emit sự kiện qua Socket.IO
  const io = req.app.get('io');
  io.emit('payment_success', {
    id: data.id,
    gateway: data.gateway,
    amount: data.transferAmount,
    account: data.accountNumber,
    transactionDate: data.transactionDate
  });

  // Trả về SePay
  res.status(200).json({ status: 'success' });
});

module.exports = router;
