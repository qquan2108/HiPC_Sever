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
const VariantProduct = require('../models/Variantproduct');
const {
  validateVoucherConditions,
  calculateDiscountAmount,
} = require("../utils/voucher");
const PDFDocument = require('pdfkit');
const { createCanvas, loadImage } = require('canvas');
const mongoose = require('mongoose');

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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { user_id, productId, quantity = 1, variant, address, phoneNumber, paymentMethod, shippingMethod, voucher, shippingFee } = req.body;
    
    // Basic validation
    if (!user_id || !productId) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    const numQuantity = Number(quantity);
    if (isNaN(numQuantity) || numQuantity < 1) {
      return res.status(400).json({ error: 'Số lượng không hợp lệ' });
    }

    // Find product with session
    const prod = await Product.findById(productId).session(session);
    if (!prod) {
      return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
    }

    let itemPrice = Number(prod.price) || 0;
    let variantInfo = null;
    const orderProducts = [];

    // Handle variant if exists
    if (variant && variant._id) {
      // Check & update variant stock
      const variantDoc = await VariantProduct.findById(variant._id).session(session);
      if (!variantDoc) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Không tìm thấy biến thể sản phẩm' });
      }

      if (variantDoc.stock < numQuantity) {
        await session.abortTransaction();
        return res.status(400).json({
          error: `Biến thể ${variantDoc.name} chỉ còn ${variantDoc.stock} sản phẩm`,
          availableStock: variantDoc.stock
        });
      }

      // Update variant stock
      await VariantProduct.updateOne(
        { _id: variant._id },
        { $inc: { stock: -numQuantity } }
      ).session(session);

      // Calculate price from variant
      itemPrice = typeof variantDoc.price === 'number'
        ? Number(variantDoc.price)
        : (Number(prod.price) + Number(variantDoc.priceDiff || 0));

      variantInfo = {
        _id: variantDoc._id,
        name: variantDoc.name,
        price: typeof variantDoc.price === 'number' ? Number(variantDoc.price) : undefined,
        priceDiff: typeof variantDoc.price === 'number' ? undefined : Number(variantDoc.priceDiff || 0)
      };

    } else {
      // Check & update main product stock
      if ((prod.stock || 0) < numQuantity) {
        await session.abortTransaction();
        return res.status(400).json({
          error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock || 0} sản phẩm`,
          availableStock: prod.stock || 0
        });
      }

      await Product.updateOne(
        { _id: prod._id },
        { $inc: { stock: -numQuantity } }
      ).session(session);
    }

    // Calculate total price
    const totalPrice = itemPrice * numQuantity;

    // Handle voucher
    let voucherDiscount = 0;
    if (voucher?.code) {
      const voucherDoc = await Voucher.findOne({
        code: voucher.code.toUpperCase()
      }).session(session);

      if (voucherDoc) {
        const validation = validateVoucherConditions(voucherDoc, totalPrice);
        if (!validation.valid) {
          await session.abortTransaction();
          return res.status(400).json({ error: validation.message });
        }
        voucherDiscount = calculateDiscountAmount(voucherDoc, totalPrice);
      }
    }

    // Calculate final amounts
    const shippingFeeAmount = Number(shippingFee) || 0;
    const finalTotal = Math.max(0, totalPrice + shippingFeeAmount - voucherDiscount);

    // Create order
    const order = new Order({
      user_id,
      products: [{
        productId: prod._id,
        quantity: numQuantity,
        price: itemPrice,
        variant: variantInfo || {}
      }],
      address,
      phoneNumber: phoneNumber || '',
      paymentMethod,
      shippingMethod,
      voucher: voucher || null,
      voucherDiscount,
      shippingFee: shippingFeeAmount,
      total_price: totalPrice,
      total: finalTotal,
      status: 'pending',
      createdAt: new Date()
    });

    await order.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Đặt hàng thành công',
      data: {
        orderId: order._id,
        totalAmount: finalTotal,
        voucherDiscount,
        shippingFee: shippingFeeAmount,
        product: {
          name: prod.name,
          price: Number(prod.price),
          variant: variantInfo,
          finalPrice: itemPrice
        },
        paymentInfo: {
          acc: '123456789',
          bank: 'VCB',
          amount: finalTotal,
          des: order._id.toString(),
        }
      }
    });

  } catch (err) {
    await session.abortTransaction();
    console.error('❌ Buy now error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Lỗi server'
    });
  } finally {
    session.endSession();
  }
});

// ===== PARAMETERIZED ROUTES (must come after specific routes) =====

// 5) Get orders by user ID
router.get("/user/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.params.userId })
      .populate({
        path: 'products.productId',
        populate: [
          { path: 'category_id' },
          { path: 'brand_id' }
        ]
      })
      .populate({
        path: 'combos.comboId',
        populate: {
          path: 'productIds',
          populate: [
            { path: 'category_id' },
            { path: 'brand_id' }
          ]
        }
      })
      .populate('combos.products.productId')
      .populate('combos.products.variant._id')
      .sort({ createdAt: -1 });

    // Process each order
    const processedOrders = await Promise.all(orders.map(async (order) => {
      // Handle regular products
      if (order.products?.length > 0) {
        for (const item of order.products) {
          if (item.productId?._id) {
            const image = await Image.findOne({ product_id: item.productId._id });
            if (item.productId) {
              item.productId.image = image?.url || null;
            }
          }
        }
      }

      // Handle combo orders
      if (order.combos?.length > 0) {
        for (const combo of order.combos) {
          if (combo.comboId) {
            // Get combo details
            const comboDetails = await Combo.findById(combo.comboId)
              .populate({
                path: 'productIds',
                populate: [
                  { path: 'category_id' },
                  { path: 'brand_id' }
                ]
              });

            // Process each product in combo
            const comboProducts = await Promise.all(
              combo.products.map(async (product) => {
                const productDoc = await Product.findById(product.productId)
                  .populate('category_id')
                  .populate('brand_id');

                // Get product image
                const image = await Image.findOne({ product_id: product.productId });
                
                // Get variant details if exists
                let variantInfo = null;
                if (product.variant?._id) {
                  const variant = await VariantProduct.findById(product.variant._id);
                  if (variant) {
                    variantInfo = {
                      _id: variant._id,
                      name: variant.name,
                      price: variant.price,
                      priceDiff: variant.price - productDoc.price
                    };
                  }
                }

                return {
                  ...productDoc.toObject(),
                  image: image?.url || null,
                  variant: variantInfo
                };
              })
            );

            // Update combo with processed products
            combo.comboDetails = {
              _id: combo.comboId._id,
              name: combo.comboId.name,
              price: combo.price,
              image: combo.comboId.image,
              products: comboProducts,
              description: `Combo ${combo.comboId.name} gồm: ${comboProducts
                .map(p => `${p.name}${p.variant ? ` - ${p.variant.name}` : ''}`)
                .join(', ')}`
            };
          }
        }
      }

      return {
        ...order.toObject(),
        itemCount: (order.products?.length || 0) + (order.combos?.length || 0),
        hasCombo: order.combos?.length > 0,
        totalItems: (order.products?.reduce((sum, p) => sum + (p.quantity || 0), 0) || 0) +
                   (order.combos?.reduce((sum, c) => sum + (c.quantity || 0), 0) || 0)
      };
    }));

    res.json(processedOrders);

  } catch (err) {
    console.error('Error fetching user orders:', err);
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
      .populate({
        path: "products.productId",
        select: "name price image brand_id category_id",
        populate: [
          { path: "brand_id", select: "name" },
          { path: "category_id", select: "name" }
        ]
      })
      .populate({
        path: "combos.comboId",
        populate: {
          path: "productIds",
          populate: [
            { path: "brand_id", select: "name" },
            { path: "category_id", select: "name" }
          ]
        }
      })
      .lean();

    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }

    // Process regular products
    if (order.products?.length > 0) {
      for (const item of order.products) {
        if (item.productId) {
          // Get product image
          const image = await Image.findOne({ product_id: item.productId._id });
          item.productId.image = image?.url || null;

          // Get variant details if exists
          if (item.variant?._id) {
            const variantDoc = await VariantProduct.findById(item.variant._id);
            if (variantDoc) {
              item.variant = {
                ...item.variant,
                name: variantDoc.name,
                price: variantDoc.price,
                stock: variantDoc.stock
              };
            }
          }
        }
      }
    }

    // Process combo products
    if (order.combos?.length > 0) {
      for (const combo of order.combos) {
        if (combo.comboId) {
          // Get combo product details
          const comboProducts = await Promise.all(
            combo.products.map(async (product) => {
              // Get base product info
              const productDoc = await Product.findById(product.productId)
                .populate("brand_id", "name")
                .populate("category_id", "name")
                .lean();

              if (!productDoc) return null;

              // Get product image
              const image = await Image.findOne({ product_id: product.productId });

              // Get all variants
              const variants = await VariantProduct.find({
                product_id: product.productId
              }).lean();

              // Get selected variant
              let selectedVariant = null;
              if (product.variant?._id) {
                selectedVariant = await VariantProduct.findById(product.variant._id);
              }

              return {
                ...productDoc,
                image: image?.url || null,
                variants: variants.map(v => ({
                  _id: v._id,
                  name: v.name,
                  price: v.price,
                  stock: v.stock,
                  priceDiff: v.price - productDoc.price
                })),
                selectedVariant: selectedVariant ? {
                  _id: selectedVariant._id,
                  name: selectedVariant.name,
                  price: selectedVariant.price,
                  stock: selectedVariant.stock,
                  priceDiff: selectedVariant.price - productDoc.price
                } : null
              };
            })
          );

          // Filter out null products
          const validProducts = comboProducts.filter(p => p);

          // Update combo details
          combo.comboDetails = {
            _id: combo.comboId._id,
            name: combo.comboId.name,
            price: combo.price,
            image: combo.comboId.image,
            products: validProducts,
            productCount: validProducts.length,
            description: `Combo ${combo.comboId.name} gồm: ${validProducts
              .map(p => `${p.name}${p.selectedVariant ? ` - ${p.selectedVariant.name}` : ''}`)
              .join(', ')}`
          };
        }
      }
    }

    // Add summary information
    const processedOrder = {
      ...order,
      itemCount: (order.products?.length || 0) + (order.combos?.length || 0),
      hasCombo: order.combos?.length > 0,
      totalItems: (order.products?.reduce((sum, p) => sum + (p.quantity || 0), 0) || 0) +
                 (order.combos?.reduce((sum, c) => sum + (c.quantity || 0), 0) || 0)
    };

    res.json(processedOrder);

  } catch (err) {
    console.error("Error fetching order details:", err);
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
