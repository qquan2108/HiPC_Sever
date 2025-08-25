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
const mongoose = require("mongoose");

const vnp_HashSecret = process.env.VNP_HASH_SECRET;

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

function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

// Build VNPAY payment URL per VNPAY specification
function buildVnpayUrl(orderId, amount, orderInfo, rawIp) {
  const tmnCode = process.env.VNPAY_TMNCODE;
  const secret = process.env.VNPAY_HASHSECRET;
  // const baseUrl = process.env.VNPAY_APIURL;
  var vnpUrl = process.env.VNPAY_APIURL;
  const returnUrl = process.env.VNPAY_RETURNURL;
  const ipAddr = normalizeIp(rawIp);

  // Compute createDate in GMT+7, format yyyyMMddHHmmss
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 3600 * 1000);
  const createDate = vnTime.toISOString().replace(/[-:T]/g, "").slice(0, 14);

  var vnp_Params = {
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

  vnp_Params = sortObject(vnp_Params);

  console.log("parram: ", vnp_Params);
  // // Compute HMAC SHA512 on unencoded query string
  // const rawData = toQueryString(vnp_Params, false);
  // const secureHash = crypto
  //   .createHmac("sha512", secret)
  //   .update(Buffer.from(rawData, "utf-8"))
  //   .digest("hex");

  var signData = querystring.stringify(vnp_Params, { encode: false });
  var crypto = require("crypto");
  var hmac = crypto.createHmac("sha512", secret);
  var signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
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
router.get("/vnpay_ipn", async (req, res) => {
  console.log("[VNPAY][IPN] incoming params:", req.query);
  const { valid, data } = verifyVnpaySignature(req.query);
  if (!valid) {
    console.error("[VNPAY][IPN] Signature mismatch");
    return res.status(200).json({ RspCode: "97", Message: "Checksum failed" });
  }

  const orderId = data.vnp_TxnRef;
  const rspCode = data.vnp_ResponseCode;
  const amount = Number(data.vnp_Amount) / 100;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(200)
        .json({ RspCode: "01", Message: "Order not found" });
    }

    if (order.total !== amount) {
      return res.status(200).json({ RspCode: "04", Message: "Amount invalid" });
    }

    if (order.paymentStatus !== "unpaid") {
      return res.status(200).json({
        RspCode: "02",
        Message: "This order has been updated to the payment status",
      });
    }

    order.paymentStatus = rspCode === "00" ? "paid" : "failed";
    await order.save();
    console.log(
      "[VNPAY][IPN] Order %s paymentStatus -> %s",
      orderId,
      order.paymentStatus
    );
    return res.status(200).json({ RspCode: "00", Message: "Success" });
  } catch (err) {
    console.error("[VNPAY][IPN] Error updating order:", err);
    return res.status(200).json({ RspCode: "99", Message: "Unknown error" });
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
      paymentStatus: success ? "paid" : "failed",
    });
    console.log(
      "[VNPAY][RETURN] Order %s set to %s",
      vnp_TxnRef,
      success ? "paid" : "failed"
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
  const paymentStatus = code === "00" ? "paid" : "failed";
  try {
    await Order.findByIdAndUpdate(orderId, { paymentStatus });
    res.json({ success: code === "00" });
    console.log(
      "[VNPAY][VERIFY] Order %s paymentStatus -> %s",
      orderId,
      paymentStatus
    );
  } catch (err) {
    console.error("[VNPAY][VERIFY] Error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

router.get("/vnpay_return", async (req, res) => {
  try {
    let vnp_Params = { ...req.query };
    const secureHash = vnp_Params["vnp_SecureHash"];

    // Xoá các trường hash trước khi ký
    delete vnp_Params["vnp_SecureHash"];
    delete vnp_Params["vnp_SecureHashType"];

    // Sắp xếp và ký lại
    vnp_Params = sortObject(vnp_Params);
    const signData = querystring.stringify(vnp_Params, { encode: false });
    const signed = crypto
      .createHmac("sha512", vnp_HashSecret)
      .update(Buffer.from(signData, "utf-8"))
      .digest("hex");

    // Chuẩn hoá lower-case để tránh sai khác hoa/thường
    const isValidSignature =
      (secureHash || "").toLowerCase() === signed.toLowerCase();

    let result;

    if (isValidSignature && vnp_Params["vnp_ResponseCode"] === "00") {
      // ✅ Thanh toán hợp lệ
      const txnRef = vnp_Params["vnp_TxnRef"];
      const amount = Number(vnp_Params["vnp_Amount"] || 0) / 100;

      // Cập nhật DB (nếu txnRef là _id)
      try {
        let order = null;
        if (mongoose.Types.ObjectId.isValid(txnRef)) {
          order = await Order.findById(txnRef).populate("paymentID");
        } else {
          // Nếu bạn dùng mã khác làm vnp_TxnRef, thay truy vấn phù hợp ở đây
          order = await Order.findOne({ code: txnRef }).populate("paymentID");
        }

        if (order) {
          order.orderStatus = "paid";
          await order.save();

          if (order.paymentID) {
            order.paymentID.status = "paid";
            order.paymentID.isPaid = true;
            await order.paymentID.save();
          }
        }
      } catch (err) {
        console.error("Lỗi update order:", err);
      }

      result = {
        status: "success",
        code: vnp_Params["vnp_ResponseCode"],
        message: "Thanh toán thành công",
        orderId: vnp_Params["vnp_TxnRef"],
        amount,
      };
    } else {
      result = {
        status: "error",
        code: isValidSignature ? vnp_Params["vnp_ResponseCode"] || "99" : "97",
        message: isValidSignature ? "Thanh toán thất bại" : "Sai chữ ký",
      };
    }

    // Trả HTML cho WebView + postMessage về RN
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Kết quả thanh toán</title>
  <style>
    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; }
    .card { text-align: center; padding: 20px; border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
    .success { color: #27ae60; }
    .error { color: #c0392b; }
  </style>
</head>
<body>
  <div class="card">
    <h2 class="${result.status}">${
      result.status === "success"
        ? "✅ Thanh toán thành công"
        : "❌ Thanh toán thất bại"
    }</h2>
    <p>${result.message}</p>
    <p>Mã đơn hàng: ${result.orderId || "-"}</p>
    <p>Số tiền: ${result.amount || 0} VND</p>
  </div>
  <script>
    setTimeout(() => {
      const data = ${JSON.stringify(result)};
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }, 500);
  </script>
</body>
</html>`);
  } catch (e) {
    console.error("vnpay_return error:", e);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
