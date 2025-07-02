const express = require('express');
const crypto = require('crypto');
const qs = require('qs');
const router = express.Router();

// Hàm chuẩn hóa IP address
function normalizeIpAddress(rawIp) {
  if (!rawIp) return '127.0.0.1';
  
  // Xử lý trường hợp có nhiều IP (x-forwarded-for)
  const ip = rawIp.split(',')[0].trim();
  
  // Xử lý IPv6 mapped IPv4
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  
  // Xử lý localhost
  if (ip === '::1') {
    return '127.0.0.1';
  }
  
  return ip;
}

// Hàm build URL
function buildVnpayUrl(orderId, amount, orderInfo, rawIp) {
  // 1) Chuẩn hóa IP (nếu cần)
  const ipAddr = rawIp?.replace(/^::ffff:/, '') || '127.0.0.1';

  // 2) Tính createDate theo UTC+7
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7*3600*1000);
  const createDate = vnTime.toISOString().replace(/[-:T]/g, '').slice(0,14);

  // 3) Tạo object params (chưa có hash)
  const vnpParams = {
    vnp_Version:   '2.1.0',
    vnp_Command:   'pay',
    vnp_TmnCode:   process.env.VNPAY_TMNCODE,
    vnp_Amount:    Math.round(amount * 10).toString(),
    vnp_CurrCode:  'VND',
    vnp_TxnRef:    String(orderId),
    vnp_OrderInfo: orderInfo,              // để nguyên, KHÔNG encode ở đây
    vnp_OrderType: 'other',
    vnp_Locale:    'vn',
    vnp_ReturnUrl: process.env.VNPAY_RETURNURL,
    vnp_IpAddr:    ipAddr,
    vnp_CreateDate: createDate
  };

  // 4) Sort và build chuỗi để hash (encode: false)
  const sortedKeys = Object.keys(vnpParams).sort();
  let hashData = sortedKeys
    .map(key => `${key}=${vnpParams[key]}`)
    .join('&')
    .trim();
  console.log('HASH DATA:', hashData);

  // 5) Tính HMAC SHA256 và uppercase
  const hmac = crypto.createHmac('sha256', process.env.VNPAY_HASHSECRET);
  const secureHash = hmac.update(hashData, 'utf8')
                         .digest('hex')
                         .toUpperCase();

  // 6) Gán vào params cuối cùng
  vnpParams.vnp_SecureHashType = 'SHA256';
  vnpParams.vnp_SecureHash     = secureHash;

  // 7) Build URL cho client (encode URI component)
  const query = Object.keys(vnpParams)
    .sort()
    .map(key => `${key}=${encodeURIComponent(vnpParams[key])}`)
    .join('&');

  return `${process.env.VNPAY_APIURL}?${query}`;
}

// POST /vnpay/create_payment
router.post('/create_payment', (req, res) => {
  const { orderId, amount, orderInfo } = req.body;
  
  // Validation input
  if (!orderId || !amount || !orderInfo) {
    return res.status(400).json({ 
      code: 1, 
      message: 'Thiếu thông tin: orderId, amount, orderInfo' 
    });
  }

  // Kiểm tra amount phải là số dương
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ 
      code: 1, 
      message: 'Số tiền không hợp lệ' 
    });
  }

  // Kiểm tra orderId không chứa ký tự đặc biệt
  if (!/^[a-zA-Z0-9_-]+$/.test(orderId)) {
    return res.status(400).json({ 
      code: 1, 
      message: 'OrderId chỉ được chứa chữ cái, số, dấu gạch dưới và gạch ngang' 
    });
  }

  const ipAddr = req.headers['x-forwarded-for'] || 
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress ||
                 req.ip;
                 
  try {
    const url = buildVnpayUrl(orderId, numAmount, orderInfo, ipAddr);
    console.log('Generated VNPay URL:', url);
    return res.json({ code: 0, data: { paymentUrl: url } });
  } catch (err) {
    console.error('Error creating VNPay URL:', err);
    return res.status(500).json({ code: 1, message: 'Lỗi tạo URL VNPAY' });
  }
});

// GET /vnpay/ipn - Xử lý callback từ VNPay
router.get('/ipn', async (req, res) => {
  try {
    console.log('VNPay IPN received:', req.query);
    
    // 1) Lấy params VNPAY gửi về
    const vnpData = { ...req.query };
    const secureHash = vnpData.vnp_SecureHash;
    
    // 2) Loại bỏ hash để tính toán lại
    delete vnpData.vnp_SecureHash;
    delete vnpData.vnp_SecureHashType;

    // 3) Sort và tạo hash data
    const sortedKeys = Object.keys(vnpData).sort();
    const hashData = sortedKeys
      .map(key => `${key}=${vnpData[key]}`)
      .join('&');
    
    console.log('IPN Hash Data:', hashData);

    // 4) Tính HMAC SHA256
    const hmac = crypto.createHmac('sha256', process.env.VNPAY_HASHSECRET);
    const calculatedHash = hmac.update(hashData, 'utf8').digest('hex');

    // 5) So sánh chữ ký
    if (calculatedHash !== secureHash) {
      console.warn('IPN - Invalid signature:', { 
        calculated: calculatedHash, 
        received: secureHash 
      });
      return res.status(200).send('97');
    }

    // 6) Xử lý kết quả thanh toán
    const responseCode = vnpData.vnp_ResponseCode;
    const orderId = vnpData.vnp_TxnRef;
    const transactionNo = vnpData.vnp_TransactionNo;
    const amount = vnpData.vnp_Amount;

    if (responseCode === '00') {
      // TODO: Cập nhật database - đơn hàng thanh toán thành công
      console.log(`✅ Order ${orderId} payment successful, VNPay txn: ${transactionNo}, amount: ${amount}`);
      
      // Thêm logic cập nhật DB ở đây
      // await updateOrderStatus(orderId, 'paid', { transactionNo, amount });
      
    } else {
      // TODO: Cập nhật database - đơn hàng thanh toán thất bại
      console.log(`❌ Order ${orderId} payment failed, code: ${responseCode}`);
      
      // Thêm logic cập nhật DB ở đây
      // await updateOrderStatus(orderId, 'failed', { responseCode });
    }

    // 7) Trả về success cho VNPay
    return res.status(200).send('00');
    
  } catch (err) {
    console.error('IPN processing error:', err);
    return res.status(200).send('99');
  }
});

// GET /vnpay/return - Xử lý khi user quay lại từ VNPay
router.get('/return', (req, res) => {
  try {
    const vnpData = { ...req.query };
    const secureHash = vnpData.vnp_SecureHash;
    
    delete vnpData.vnp_SecureHash;
    delete vnpData.vnp_SecureHashType;

    // Verify signature
    const sortedKeys = Object.keys(vnpData).sort();
    const hashData = sortedKeys
      .map(key => `${key}=${vnpData[key]}`)
      .join('&');
    
    const hmac = crypto.createHmac('sha256', process.env.VNPAY_HASHSECRET);
    const calculatedHash = hmac.update(hashData, 'utf8').digest('hex');

    if (calculatedHash !== secureHash) {
      return res.status(400).json({ 
        code: 1, 
        message: 'Chữ ký không hợp lệ' 
      });
    }

    const responseCode = vnpData.vnp_ResponseCode;
    const orderId = vnpData.vnp_TxnRef;

    if (responseCode === '00') {
      // Redirect đến trang thành công
      return res.redirect(`${process.env.FRONTEND_URL}/payment/success?orderId=${orderId}`);
    } else {
      // Redirect đến trang thất bại
      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?orderId=${orderId}&code=${responseCode}`);
    }
    
  } catch (err) {
    console.error('Return processing error:', err);
    return res.redirect(`${process.env.FRONTEND_URL}/payment/error`);
  }
});

module.exports = router;