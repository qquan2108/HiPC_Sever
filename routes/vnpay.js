// File: routes/vnpay.js
// ENVIRONMENT VARIABLES:
// - VNPAY_TMNCODE: merchant terminal code
// - VNPAY_HASHSECRET: merchant secret key
// - VNPAY_APIURL: payment URL (sandbox or production)
// - VNPAY_RETURNURL: return URL registered in VNPAY dashboard
// - FRONTEND_URL: deep-link/universal link for mobile app

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const Order = require("../models/Order");
const querystring = require("qs");

// Normalize IP address
function normalizeIp(rawIp) {
  if (!rawIp) return "127.0.0.1";
  const ip = rawIp.replace(/^::ffff:/, "");
  return ip === "::1" ? "127.0.0.1" : ip;
}

// Helper to stringify params in a sorted order.
// If `encode` is false, values are left unencoded (required when hashing).
function toQueryString(params, encode = true) {
  return Object.keys(params)
    .sort()
    .map((key) => {
      const k = encode ? encodeURIComponent(key) : key;
      const v = encode ? encodeURIComponent(params[key]) : params[key];
      return `${k}=${v}`;
    })
    .join("&");
}

// Build VNPAY payment URL per VNPAY specification
function buildVnpayUrl(orderId, amount, orderInfo, rawIp) {
  const tmnCode = process.env.VNPAY_TMNCODE;
  const secret = process.env.VNPAY_HASHSECRET;
  // const baseUrl = process.env.VNPAY_APIURL;
  const vnpUrl = process.env.VNPAY_APIURL;
  const returnUrl = process.env.VNPAY_RETURNURL;
  const ipAddr = normalizeIp(rawIp);

  // Compute createDate in GMT+7, format yyyyMMddHHmmss
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 3600 * 1000);
  const createDate = vnTime.toISOString().replace(/[-:T]/g, "").slice(0, 14);

  const vnp_Params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Amount: String(Math.round(amount * 100)),
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  // // Compute HMAC SHA512 on unencoded query string
  // const rawData = toQueryString(vnp_Params, false);
  // const secureHash = crypto
  //   .createHmac("sha512", secret)
  //   .update(Buffer.from(rawData, "utf-8"))
  //   .digest("hex");

  var signData = querystring.stringify(vnp_Params, { encode: false });
  var crypto = require("crypto");
  var hmac = crypto.createHmac("sha512", secret);
  var signed = hmac.update(new Buffer(signData, "utf-8")).digest("hex");
  vnp_Params["vnp_SecureHash"] = signed;
  vnpUrl += "?" + querystring.stringify(vnp_Params, { encode: false });

  // // Append signature parameters and build final encoded URL
  // const signedParams = {
  //   ...vnp_Params,
  //   vnp_SecureHashType: "HMACSHA512",
  //   vnp_SecureHash: secureHash,
  // };

  return vnpUrl;
}

// POST /vnpay/create_payment
router.post("/create_payment", async (req, res) => {
  const { orderId, amount, orderInfo } = req.body;
  try {
    const ip =
      req.headers["x-forwarded-for"] || req.ip || req.socket.remoteAddress;

    // console.log("line 90: IP address:", ip);

    const paymentUrl = buildVnpayUrl(
      orderId,
      parseFloat(amount),
      orderInfo,
      ip
    );

    // console.log(
    //   '[VNPAY][CREATE] orderId=%s, amount=%s, orderInfo=%s, ip=%s',
    //   orderId,
    //   amount,
    //   orderInfo,
    //   ip
    // );
    // console.log('[VNPAY][CREATE] paymentUrl=', paymentUrl);

    res.json({ code: 0, data: { paymentUrl } });
  } catch (err) {
    console.error("[VNPAY][CREATE] Error:", err);
    res.status(500).json({ code: 1, message: "Lỗi tạo URL thanh toán" });
  }
});

// Helper: verify VNPAY HMAC signature
function verifyVnpaySignature(query) {
  const data = { ...query };
  const secureHash = data.vnp_SecureHash;
  delete data.vnp_SecureHash;
  delete data.vnp_SecureHashType;

  // VNPAY signs the unencoded query string
  const rawData = toQueryString(data, false);
  const calcHash = crypto
    .createHmac("sha512", process.env.VNPAY_HASHSECRET)
    .update(rawData, "utf8")
    .digest("hex");

  return {
    valid: calcHash === secureHash,
    calcHash,
    secureHash,
    rawData,
    data,
  };
}

// GET /vnpay/ipn – Instant Payment Notification
router.get("/ipn", async (req, res) => {
  console.log("[VNPAY][IPN] incoming params:", req.query);
  const { valid, calcHash, secureHash, rawData, data } = verifyVnpaySignature(
    req.query
  );
  if (!valid) {
    console.error("[VNPAY][IPN] Signature mismatch!", {
      secureHash,
      calcHash,
      rawData,
      data,
    });
    return res.status(200).send("97");
  }

  const { vnp_TxnRef, vnp_ResponseCode } = data;
  const status = vnp_ResponseCode === "00" ? "paid" : "payment_failed";
  try {
    await Order.findByIdAndUpdate(vnp_TxnRef, { status });
    console.log("[VNPAY][IPN] Order %s updated to %s", vnp_TxnRef, status);
    res.status(200).send(vnp_ResponseCode === "00" ? "00" : "01");
  } catch (err) {
    console.error("[VNPAY][IPN] Error updating order:", err);
    res.status(200).send("99");
  }
});

// GET /vnpay/return – user redirect
router.get("/return", async (req, res) => {
  console.log("[VNPAY][RETURN] incoming params:", req.query);
  const { valid, calcHash, secureHash, rawData, data } = verifyVnpaySignature(
    req.query
  );
  if (!valid) {
    console.error("[VNPAY][RETURN] Signature mismatch!", {
      secureHash,
      calcHash,
      rawData,
      data,
    });
    return res.status(400).json({ code: 1, message: "Chữ ký không hợp lệ" });
  }

  try {
    const { vnp_TxnRef, vnp_ResponseCode } = data;
    const success = vnp_ResponseCode === "00";
    await Order.findByIdAndUpdate(vnp_TxnRef, {
      status: success ? "paid" : "payment_failed",
    });
    console.log(
      "[VNPAY][RETURN] Order %s set to %s",
      vnp_TxnRef,
      success ? "paid" : "payment_failed"
    );

    const FE = process.env.FRONTEND_URL;
    const redirectUrl = success
      ? `${FE}?status=success&orderId=${vnp_TxnRef}`
      : `${FE}?status=failed&orderId=${vnp_TxnRef}&code=${vnp_ResponseCode}`;

    console.log("[VNPAY][RETURN] Redirecting to:", redirectUrl);
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("[VNPAY][RETURN] Error processing return:", err);
    res
      .status(500)
      .json({ code: 1, message: "Lỗi xử lý thông tin thanh toán" });
  }
});

// POST /vnpay/verify_payment – Front-end callback
router.post("/verify_payment", async (req, res) => {
  const { orderId, code } = req.body;
  const status = code === "00" ? "paid" : "payment_failed";
  try {
    await Order.findByIdAndUpdate(orderId, { status });
    res.json({ success: code === "00" });
  } catch (err) {
    console.error("[VNPAY][VERIFY] Error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

module.exports = router;
