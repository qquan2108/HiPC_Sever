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

    // Tính toán chiều cao động
    const width = 900;
    let height = 600 + order.products.length * 200;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Nền gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#f8f9ff');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Header với logo và thông tin công ty
    const headerHeight = 120;
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, '#1e40af');
    headerGradient.addColorStop(1, '#3b82f6');
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, width, headerHeight);

    // Logo placeholder (có thể thay thế bằng logo thật)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(30, 20, 80, 80);
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('HiPC', 70, 65);

    // Thông tin công ty
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('HiPC COMPUTER', 130, 45);
    
    ctx.font = '14px Arial';
    ctx.fillText('Chuyên cung cấp thiết bị vi tính chính hãng', 130, 65);
    ctx.fillText('Hotline: 1900-xxxx | Email: info@hipc.com.vn', 130, 85);

    // Tiêu đề hóa đơn
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('HÓA ĐƠN BÁN HÀNG', width / 2, 180);

    // Khung thông tin khách hàng
    const customerBoxY = 220;
    const customerBoxHeight = 180;
    
    // Nền khung khách hàng
    ctx.fillStyle = '#f1f5f9';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.fillRect(30, customerBoxY, width - 60, customerBoxHeight);
    ctx.strokeRect(30, customerBoxY, width - 60, customerBoxHeight);

    // Thông tin khách hàng
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    let y = customerBoxY + 35;
    
    ctx.fillText('THÔNG TIN KHÁCH HÀNG', 50, y);
    
    ctx.font = '16px Arial';
    ctx.fillText(`Mã đơn hàng: #${order._id}`, 50, y += 35);
    ctx.fillText(`Khách hàng: ${order.user_id?.full_name || 'Không có thông tin'}`, 50, y += 25);
    ctx.fillText(`Số điện thoại: ${order.user_id?.phone || 'Không có thông tin'}`, 50, y += 25);
    ctx.fillText(`Email: ${order.user_id?.email || 'Không có thông tin'}`, 50, y += 25);
    ctx.fillText(`Địa chỉ giao hàng: ${order.address || 'Không có thông tin'}`, 50, y += 25);

    // Ngày tạo hóa đơn
    const orderDate = new Date(order.createdAt || Date.now());
    ctx.fillText(`Ngày đặt hàng: ${orderDate.toLocaleDateString('vi-VN')}`, 480, customerBoxY + 70);
    ctx.fillText(`Phương thức thanh toán: ${order.paymentMethod || 'COD'}`, 480, customerBoxY + 95);
    ctx.fillText(`Trạng thái: ${order.status || 'Đang xử lý'}`, 480, customerBoxY + 120);

    // Bảng sản phẩm
    const tableStartY = customerBoxY + customerBoxHeight + 40;
    
    // Header bảng
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(30, tableStartY, width - 60, 45);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    
    ctx.fillText('STT', 70, tableStartY + 28);
    ctx.fillText('Tên sản phẩm', 250, tableStartY + 28);
    ctx.fillText('SL', 500, tableStartY + 28);
    ctx.fillText('Đơn giá', 600, tableStartY + 28);
    ctx.fillText('Thành tiền', 750, tableStartY + 28);

    // Nội dung bảng
    ctx.fillStyle = '#1e293b';
    ctx.font = '14px Arial';
    let currentY = tableStartY + 45;
    let total = 0;
    let stt = 1;

    order.products.forEach((item, index) => {
      const prod = item.productId;
      const price = (prod.price || 0) + (item.variant?.priceDiff || 0);
      const lineTotal = price * item.quantity;
      total += lineTotal;

      // Màu nền xen kẽ cho các dòng
      if (index % 2 === 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(30, currentY, width - 60, 45);
      }

      ctx.fillStyle = '#1e293b';
      
      // STT
      ctx.textAlign = 'center';
      ctx.fillText(stt.toString(), 70, currentY + 28);
      
      // Tên sản phẩm (cắt ngắn nếu quá dài)
      let productName = `${prod.name}${item.variant ? ' (' + item.variant.label + ')' : ''}`;
      if (productName.length > 35) {
        productName = productName.substring(0, 32) + '...';
      }
      ctx.textAlign = 'left';
      ctx.fillText(productName, 120, currentY + 28);
      
      // Số lượng
      ctx.textAlign = 'center';
      ctx.fillText(item.quantity.toString(), 500, currentY + 28);
      
      // Đơn giá
      ctx.fillText(price.toLocaleString('vi-VN') + 'đ', 600, currentY + 28);
      
      // Thành tiền
      ctx.fillText(lineTotal.toLocaleString('vi-VN') + 'đ', 750, currentY + 28);
      
      currentY += 45;
      stt++;
    });

    // Đường kẻ cuối bảng
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, currentY);
    ctx.lineTo(width - 30, currentY);
    ctx.stroke();

    // Phần tổng kết
    currentY += 40;
    const summaryX = width - 350;
    
    ctx.fillStyle = '#374151';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    
    ctx.fillText(`Tổng giá trị sản phẩm:`, summaryX, currentY);
    ctx.textAlign = 'right';
    ctx.fillText(`${total.toLocaleString('vi-VN')} VND`, width - 50, currentY);
    
    if (order.voucherDiscount) {
      currentY += 25;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dc2626';
      ctx.fillText(`Giảm giá voucher:`, summaryX, currentY);
      ctx.textAlign = 'right';
      ctx.fillText(`-${order.voucherDiscount.toLocaleString('vi-VN')} VND`, width - 50, currentY);
    }
    
    if (order.shippingVoucherDiscount) {
      currentY += 25;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dc2626';
      ctx.fillText(`Giảm giá phí ship:`, summaryX, currentY);
      ctx.textAlign = 'right';
      ctx.fillText(`-${order.shippingVoucherDiscount.toLocaleString('vi-VN')} VND`, width - 50, currentY);
    }
    
    currentY += 25;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#374151';
    ctx.fillText(`Phí vận chuyển:`, summaryX, currentY);
    ctx.textAlign = 'right';
    ctx.fillText(`${(order.shippingFee || 0).toLocaleString('vi-VN')} VND`, width - 50, currentY);

    // Tổng thanh toán
    currentY += 35;
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(summaryX - 20, currentY - 25, 370, 45);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`TỔNG THANH TOÁN:`, summaryX, currentY);
    ctx.textAlign = 'right';
    ctx.fillText(`${(order.total || 0).toLocaleString('vi-VN')} VND`, width - 50, currentY);

    // Footer
    currentY += 80;
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Cảm ơn quý khách đã tin tưởng và sử dụng sản phẩm của HiPC!', width / 2, currentY);
    ctx.fillText('Mọi thắc mắc xin liên hệ: 1900-xxxx hoặc info@hipc.com.vn', width / 2, currentY + 20);
    ctx.fillText('Website: www.hipc.com.vn | Facebook: HiPC Computer Official', width / 2, currentY + 40);

    // Thêm watermark
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.rotate(-Math.PI / 6);
    ctx.fillText('HiPC COMPUTER', width / 3, height / 2);
    ctx.restore();

    // Export
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="HoaDon_HiPC_${order._id}.png"`);
    canvas.createPNGStream().pipe(res);

  } catch (err) {
    console.error('Export invoice image error:', err);
    res.status(500).json({ error: 'Không thể xuất hóa đơn ảnh' });
  }
});

module.exports = router;
