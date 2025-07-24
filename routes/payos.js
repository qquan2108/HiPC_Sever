const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST /payos/create-payment
router.post('/create-payment', async (req, res) => {
  const { amount, orderId, description } = req.body;
  try {
    const response = await axios.post('https://api.payos.vn/v1/payments', {
      client_id: process.env.PAYOS_CLIENT_ID,
      api_key: process.env.PAYOS_API_KEY,
      order_id: orderId,
      total: amount,
      description,
      return_url: 'myapp://payos-success',
      cancel_url: 'myapp://payos-cancel'
    });
    // API trả về payment_url
    res.json({ paymentUrl: response.data.payment_url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Tạo link thất bại' });
  }
});

module.exports = router;
