const express = require('express');
const Stripe  = require('stripe');
const router  = express.Router();

// Khởi tạo Stripe với secret key từ ENV
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15',
});

// POST /stripe/create-payment-intent
// Nhận body: { amount: number, currency?: string, metadata?: object }
router.post('/create-payment-intent', async (req, res) => {
  const { amount, currency = 'vnd', metadata } = req.body;
  try {
    // Stripe amount phải theo đơn vị nhỏ (ví dụ VND: đơn vị = đồng)
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,                // gắn orderId, userId… để webhook xử lý
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe create-payment-intent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook endpoint để Stripe notify khi payment hoàn thành
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.warn('⚠️ Webhook signature verification failed.', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Xử lý event
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;
      // TODO: cập nhật DB order status là “paid”
      console.log(`💰 PaymentIntent for order ${orderId} succeeded.`);
    }

    res.json({ received: true });
  }
);

module.exports = router;
