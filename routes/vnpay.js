// File: routes/vnpay.js
// ENVIRONMENT VARIABLES:
// - VNPAY_TMNCODE: merchant terminal code
// - VNPAY_HASHSECRET: merchant secret key
// - VNPAY_APIURL: payment URL (sandbox or production)
// - VNPAY_RETURNURL: return URL registered in VNPAY dashboard
// - FRONTEND_URL: deep-link/universal link for mobile app

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const Order   = require('../models/Order');

// Normalize IP address
function normalizeIp(rawIp) {
  if (!rawIp) return '127.0.0.1';
  const ip = rawIp.replace(/^::ffff:/, '');
  return ip === '::1' ? '127.0.0.1' : ip;
}

// Build VNPAY payment URL (checksum via HMAC-SHA512 per docs)
function buildVnpayUrl(orderId, amount, orderInfo, rawIp) {
  const tmnCode   = process.env.VNPAY_TMNCODE;
  const secret    = process.env.VNPAY_HASHSECRET;
  const apiUrl    = process.env.VNPAY_APIURL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  const returnUrl = process.env.VNPAY_RETURNURL;
  const ipAddr    = normalizeIp(rawIp);

  // CreateDate in GMT+7, format yyyyMMddHHmmss
  const now    = new Date();
  const vnTime = new Date(now.getTime() + 7 * 3600 * 1000);
  const createDate = vnTime.toISOString().replace(/[-:T]/g, '').slice(0, 14);

  // Prepare parameters
  const params = {
    vnp_Version:   '2.1.0',
    vnp_Command:   'pay',
    vnp_TmnCode:   tmnCode,
    vnp_Amount:    String(Math.round(amount * 100)),
    vnp_CurrCode:  'VND',
    vnp_TxnRef:    orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Locale:    'vn',
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr:    ipAddr,
    vnp_CreateDate:createDate
  };

  // Sort keys
  const sortedKeys = Object.keys(params).sort();
  // Build hash data string: urlencode(key)=urlencode(value)&...
  const hashData = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  // Compute HMAC-SHA512
  const secureHash = crypto
    .createHmac('sha512', secret)
    .update(hashData, 'utf8')
    .digest('hex');

  // Append hash to params
  params.vnp_SecureHashType = 'HMACSHA512';
  params.vnp_SecureHash     = secureHash;

  // Build query string (include hash fields last)
  const query = sortedKeys
    .concat(['vnp_SecureHashType', 'vnp_SecureHash'])
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  return `${apiUrl}?${query}`;
}

// POST /vnpay/create_payment
router.post('/create_payment', async (req, res) => {
  const { orderId, amount, orderInfo } = req.body;
  if (!orderId || !amount || !orderInfo) {
    return res.status(400).json({ code: 1, message: 'Thiếu orderId, amount hoặc orderInfo' });
  }
  try {
    const ip         = req.headers['x-forwarded-for'] || req.ip;
    const paymentUrl = buildVnpayUrl(orderId, parseFloat(amount), orderInfo, ip);
    return res.json({ code: 0, data: { paymentUrl } });
  } catch (err) {
    console.error('Lỗi tạo URL VNPAY:', err);
    return res.status(500).json({ code: 1, message: 'Lỗi tạo URL thanh toán' });
  }
});

// GET /vnpay/ipn – Instant Payment Notification
router.get('/ipn', async (req, res) => {
  const vnpData    = { ...req.query };
  const secureHash = vnpData.vnp_SecureHash;
  delete vnpData.vnp_SecureHash;
  delete vnpData.vnp_SecureHashType;

  const sortedKeys = Object.keys(vnpData).sort();
  const hashData   = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(vnpData[key])}`)
    .join('&');
  const calcHash   = crypto
    .createHmac('sha512', process.env.VNPAY_HASHSECRET)
    .update(hashData, 'utf8')
    .digest('hex');

  if (calcHash !== secureHash) {
    console.warn('IPN signature mismatch');
    return res.status(200).send('97');
  }

  const { vnp_TxnRef, vnp_ResponseCode } = vnpData;
  const status = vnp_ResponseCode === '00' ? 'paid' : 'payment_failed';
  try {
    await Order.findByIdAndUpdate(vnp_TxnRef, { status });
    return res.status(200).send(vnp_ResponseCode === '00' ? '00' : '01');
  } catch {
    return res.status(200).send('99');
  }
});

// GET /vnpay/return – User redirect
router.get('/return', async (req, res) => {
  const vnpData    = { ...req.query };
  const secureHash = vnpData.vnp_SecureHash;
  delete vnpData.vnp_SecureHash;
  delete vnpData.vnp_SecureHashType;

  const sortedKeys = Object.keys(vnpData).sort();
  const hashData   = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(vnpData[key])}`)
    .join('&');
  const calcHash   = crypto
    .createHmac('sha512', process.env.VNPAY_HASHSECRET)
    .update(hashData, 'utf8')
    .digest('hex');

  if (calcHash !== secureHash) {
    return res.status(400).json({ code: 1, message: 'Chữ ký không hợp lệ' });
  }

  const { vnp_TxnRef, vnp_ResponseCode } = vnpData;
  const success = vnp_ResponseCode === '00';
  await Order.findByIdAndUpdate(vnp_TxnRef, { status: success ? 'paid' : 'payment_failed' });

  const FE = process.env.FRONTEND_URL;
  const target = success
    ? `${FE}?status=success&orderId=${vnp_TxnRef}`
    : `${FE}?status=failed&orderId=${vnp_TxnRef}&code=${vnp_ResponseCode}`;
  return res.redirect(target);
});

// POST /vnpay/verify_payment – Front-end callback
router.post('/verify_payment', async (req, res) => {
  const { orderId, code } = req.body;
  const status = code === '00' ? 'paid' : 'payment_failed';
  try {
    await Order.findByIdAndUpdate(orderId, { status });
    return res.json({ success: code === '00' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
