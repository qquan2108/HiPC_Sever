// routes/orders.js
const express = require("express");
const router = express.Router();
const orderCtrl = require("../controllers/orderCtrl");
const Order = require("../models/Order");
const Image = require("../models/Image");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const Combo = require("../models/Combo");
const Voucher = require("../models/Voucher");
const {
  validateVoucherConditions,
  calculateDiscountAmount,
} = require("../utils/voucher");
const PDFDocument = require('pdfkit');
const { createCanvas, loadImage } = require('canvas');

// ===== SPECIFIC ROUTES FIRST (before parameterized routes) =====

// 1) Get unpaid orders - MUST be before /:id route
router.get("/unpaid", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: "Thiếu user_id" });

    // Thêm điều kiện paymentMethod !== 'cod'
    const orders = await Order.find({
      user_id,
      status: "pending",
      paymentMethod: { $ne: "cod" }, // Loại bỏ đơn COD
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    console.error("Get unpaid orders error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2) Get status tabs
router.get("/status-tabs", (req, res) => {
  res.json([
    { key: "pending", label: "Chờ xác nhận", icon: "clock-outline" },
    { key: "packed", label: "Chờ lấy hàng", icon: "package-variant-closed" },
    { key: "shipping", label: "Chờ giao hàng", icon: "truck-fast-outline" },
    { key: "delivered", label: "Đã giao", icon: "check-circle-outline" },
    { key: "return_requested", label: "Trả hàng", icon: "backup-restore" },
    { key: "cancelled", label: "Đã huỷ", icon: "close-circle-outline" },
  ]);
});

// 3) Get all orders with pagination - MUST be before /:id route
router.get("/", async (req, res) => {
  try {
    const { status, q, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Order.countDocuments(filter);

    let orders = await Order.find(filter)
      .populate("products.productId")
      .populate("combos.comboId")
      .populate("user_id", "full_name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    if (q) {
      const keyword = q.toLowerCase();
      orders = orders.filter(
        (o) =>
          o._id.toString().toLowerCase().includes(keyword) ||
          (o.user_id?.full_name &&
            o.user_id.full_name.toLowerCase().includes(keyword))
      );
    }

    res.json({
      data: orders,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4) Checkout endpoint
router.post("/checkout", orderCtrl.createOrder);

router.post('/buy-now', async (req, res) => {
  try {
    const { user_id, productId, quantity = 1, variant, address, paymentMethod, shippingMethod, voucher, shippingFee } = req.body;
    
    // 1. Validation đầu vào
    if (!user_id || !productId || !quantity) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Số lượng phải lớn hơn 0.' });
    }

    // 2. Lấy sản phẩm
    const prod = await Product.findById(productId);
    if (!prod) {
      return res.status(404).json({ error: 'Sản phẩm không tồn tại.' });
    }

    // 3. Kiểm tra tồn kho
    if (prod.stock < quantity) {
      return res.status(400).json({ 
        error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock} sản phẩm` 
      });
    }

    // 4. Tính giá gốc
    const basePrice = Number(prod.price) || 0;
    const variantPrice = Number(variant?.priceDiff) || 0;
    const itemPrice = basePrice + variantPrice;
    const totalPrice = itemPrice * quantity;

    // 5. Áp dụng voucher (nếu có)
    let voucherDiscount = 0;
    if (voucher && voucher.code) {
      const voucherDoc = await Voucher.findOne({ code: voucher.code?.toUpperCase?.() || voucher.code });
      if (voucherDoc) {
        const validation = validateVoucherConditions(voucherDoc, totalPrice);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.message });
        }
        voucherDiscount = calculateDiscountAmount(voucherDoc, totalPrice);
      }
    }

    // 6. Áp dụng phí ship (nếu có)
    let fee = 0;
    if (typeof shippingFee === 'number') {
      fee = shippingFee;
    }

    // 7. Tổng cuối cùng
    const finalTotal = Math.max(0, totalPrice + fee - voucherDiscount);

    // 8. Trừ kho (transaction)
    const session = await mongoose.startSession();
    let order;

    try {
      await session.withTransaction(async () => {
        const currentProd = await Product.findById(productId).session(session);
        if (currentProd.stock < quantity) {
          throw new Error(`Sản phẩm ${currentProd.name} chỉ còn ${currentProd.stock} sản phẩm`);
        }

        await Product.updateOne(
          { _id: prod._id },
          { $inc: { stock: -quantity } }
        ).session(session);

        order = new Order({
          user_id,
          products: [{
            productId: prod._id,
            quantity,
            price: itemPrice,
            variant: variant || {}
          }],
          address,
          paymentMethod,
          shippingMethod,
          voucher,
          voucherDiscount,
          shippingFee: fee,
          total_price: totalPrice,
          total: finalTotal,
          status: 'pending',
          createdAt: new Date()
        });

        await order.save({ session });
      });
    } finally {
      await session.endSession();
    }

    // 9. Auto cancel giữ nguyên...

    // 10. Trả về response
    res.status(200).json({
      success: true,
      message: 'Đặt hàng thành công',
      data: {
        orderId: order._id,
        totalAmount: finalTotal,
        voucherDiscount,
        shippingFee: fee,
        paymentInfo: {
          acc: '123456789',
          bank: 'VCB',
          amount: finalTotal,
          des: order._id.toString(),
        }
      }
    });

  } catch (err) {
    console.error('❌ Buy now error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message || 'Lỗi server' 
    });
  }
});

// ===== PARAMETERIZED ROUTES (must come after specific routes) =====

// 5) Get orders by user ID
router.get("/user/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.params.userId })
      .populate("products.productId")
      .populate("combos.comboId");
    // Gắn URL ảnh cho từng sản phẩm
    for (const order of orders) {
      for (const item of order.products) {
        if (item.productId?._id) {
          const img = await Image.findOne({ product_id: item.productId._id });
          item.productId.image = img ? img.url : null;
        }
      }
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6) Get payment info for specific order
router.get("/:id/pay-info", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.status !== "pending") {
      return res
        .status(404)
        .json({ error: "Đơn hàng không tồn tại hoặc đã thanh toán" });
    }

    res.json({
      orderId: order._id,
      acc: "123456789", // số tài khoản nhận
      bank: "VCB", // mã ngân hàng
      amount: order.total,
      des: order._id.toString(), // để webhook mapping
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7) Update order status
router.put("/:orderId/status", orderCtrl.updateStatus);

// 8) Cancel order
router.put("/:orderId/cancel", orderCtrl.cancelOrder);

// 9) Return stock for cancelled order
router.post("/:orderId/return-stock", orderCtrl.returnStockForCancelledOrder);

// 10) Update order (general update)
router.put("/:id", async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    })
      .populate("products.productId")
      .populate("combos.comboId");

    if (!updated) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }

    res.json(updated);
  } catch (err) {
    console.error("Update order error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 11) Get order by ID - MUST be last among GET routes
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user_id", "full_name phone email")
      .populate("products.productId", "name price image")
      .populate("combos.comboId")
      .lean();

    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/invoice-pdf', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user_id', 'full_name phone email')
      .populate('products.productId', 'name price')
      .lean();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    // Khởi tạo PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="HoaDon_${order._id}.pdf"`);

    // Header
    doc.fontSize(20).text('HÓA ĐƠN BÁN HÀNG', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Mã đơn hàng: #${order._id}`);
    doc.text(`Khách hàng: ${order.user_id?.full_name || ''}`);
    doc.text(`SĐT: ${order.user_id?.phone || ''}`);
    doc.text(`Email: ${order.user_id?.email || ''}`);
    doc.text(`Địa chỉ: ${order.address || ''}`);
    doc.moveDown();

    // Table header
    doc.font('Helvetica-Bold').text('Sản phẩm', 40, doc.y, { continued: true });
    doc.text('SL', 250, doc.y, { continued: true });
    doc.text('Đơn giá', 300, doc.y, { continued: true });
    doc.text('Thành tiền', 400, doc.y);
    doc.font('Helvetica');

    // Table rows
    let total = 0;
    order.products.forEach(item => {
      const prod = item.productId;
      const price = (prod.price || 0) + (item.variant?.priceDiff || 0);
      const lineTotal = price * item.quantity;
      total += lineTotal;
      doc.text(`${prod.name}${item.variant ? ' (' + item.variant.label + ')' : ''}`, 40, doc.y, { continued: true });
      doc.text(item.quantity, 250, doc.y, { continued: true });
      doc.text(price.toLocaleString('vi-VN'), 300, doc.y, { continued: true });
      doc.text(lineTotal.toLocaleString('vi-VN'), 400, doc.y);
    });

    doc.moveDown();

    // Tổng cộng và giảm giá
    doc.text(`Tổng giá trị sản phẩm: ${total.toLocaleString('vi-VN')} VND`);
    if (order.voucherDiscount) {
      doc.text(`Giảm giá mã đơn hàng: -${order.voucherDiscount.toLocaleString('vi-VN')} VND`);
    }
    if (order.shippingVoucherDiscount) {
      doc.text(`Giảm giá phí vận chuyển: -${order.shippingVoucherDiscount.toLocaleString('vi-VN')} VND`);
    }
    doc.text(`Phí vận chuyển: ${(order.shippingFee || 0).toLocaleString('vi-VN')} VND`);
    doc.moveDown();
    doc.font('Helvetica-Bold').text(`Tổng thanh toán: ${(order.total || 0).toLocaleString('vi-VN')} VND`, { align: 'right' });

    doc.end();
    doc.pipe(res);
  } catch (err) {
    console.error('Export PDF error:', err);
    res.status(500).json({ error: 'Không thể xuất hóa đơn PDF' });
  }
});

router.get('/:id/invoice-image', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user_id', 'full_name phone email')
      .populate('products.productId', 'name price')
      .lean();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    // Tạo canvas
    const width = 800;
    let height = 400 + order.products.length * 40;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Nền trắng
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // Tiêu đề
    ctx.fillStyle = '#222';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('HÓA ĐƠN BÁN HÀNG', width / 2, 50);

    ctx.textAlign = 'left';
    ctx.font = '16px Arial';
    let y = 90;
    ctx.fillText(`Mã đơn hàng: #${order._id}`, 40, y);
    ctx.fillText(`Khách hàng: ${order.user_id?.full_name || ''}`, 40, y += 28);
    ctx.fillText(`SĐT: ${order.user_id?.phone || ''}`, 40, y += 28);
    ctx.fillText(`Email: ${order.user_id?.email || ''}`, 40, y += 28);
    ctx.fillText(`Địa chỉ: ${order.address || ''}`, 40, y += 28);

    // Header bảng
    y += 30;
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Sản phẩm', 40, y);
    ctx.fillText('SL', 350, y);
    ctx.fillText('Đơn giá', 420, y);
    ctx.fillText('Thành tiền', 550, y);

    ctx.font = '16px Arial';
    let total = 0;
    order.products.forEach(item => {
      const prod = item.productId;
      const price = (prod.price || 0) + (item.variant?.priceDiff || 0);
      const lineTotal = price * item.quantity;
      total += lineTotal;
      y += 32;
      ctx.fillText(`${prod.name}${item.variant ? ' (' + item.variant.label + ')' : ''}`, 40, y);
      ctx.fillText(item.quantity.toString(), 350, y);
      ctx.fillText(price.toLocaleString('vi-VN'), 420, y);
      ctx.fillText(lineTotal.toLocaleString('vi-VN'), 550, y);
    });

    // Tổng cộng và giảm giá
    y += 40;
    ctx.font = '16px Arial';
    ctx.fillText(`Tổng giá trị sản phẩm: ${total.toLocaleString('vi-VN')} VND`, 40, y);
    if (order.voucherDiscount) {
      y += 28;
      ctx.fillText(`Giảm giá mã đơn hàng: -${order.voucherDiscount.toLocaleString('vi-VN')} VND`, 40, y);
    }
    if (order.shippingVoucherDiscount) {
      y += 28;
      ctx.fillText(`Giảm giá phí vận chuyển: -${order.shippingVoucherDiscount.toLocaleString('vi-VN')} VND`, 40, y);
    }
    y += 28;
    ctx.fillText(`Phí vận chuyển: ${(order.shippingFee || 0).toLocaleString('vi-VN')} VND`, 40, y);

    y += 40;
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#d32f2f';
    ctx.fillText(`Tổng thanh toán: ${(order.total || 0).toLocaleString('vi-VN')} VND`, 40, y);

    // Xuất ảnh PNG
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="HoaDon_${order._id}.png"`);
    canvas.createPNGStream().pipe(res);

  } catch (err) {
    console.error('Export image error:', err);
    res.status(500).json({ error: 'Không thể xuất hóa đơn ảnh' });
  }
});

module.exports = router;
