// routes/orders.js
const express = require('express');
const router = express.Router();
const orderCtrl = require('../controllers/orderCtrl');
const Order = require('../models/Order');
const Image = require('../models/Image');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Combo = require('../models/Combo');
const Voucher = require('../models/Voucher');
const { validateVoucherConditions, calculateDiscountAmount } = require('../utils/voucher');

// ===== SPECIFIC ROUTES FIRST (before parameterized routes) =====

// 1) Get unpaid orders - MUST be before /:id route
router.get('/unpaid', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: "Thiếu user_id" });

    // Thêm điều kiện paymentMethod !== 'cod'
    const orders = await Order.find({ 
      user_id, 
      status: 'pending',
      paymentMethod: { $ne: 'cod' } // Loại bỏ đơn COD
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    console.error('Get unpaid orders error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2) Get status tabs
router.get('/status-tabs', (req, res) => {
  res.json([
    { key: 'pending', label: 'Chờ xác nhận', icon: 'clock-outline' },
    { key: 'packed', label: 'Chờ lấy hàng', icon: 'package-variant-closed' },
    { key: 'shipping', label: 'Chờ giao hàng', icon: 'truck-fast-outline' },
    { key: 'delivered', label: 'Đã giao', icon: 'check-circle-outline' },
    { key: 'return_requested', label: 'Trả hàng', icon: 'backup-restore' },
    { key: 'cancelled', label: 'Đã huỷ', icon: 'close-circle-outline' },
  ]);
});

// 3) Get all orders with pagination - MUST be before /:id route
router.get('/', async (req, res) => {
  try {
    const { status, q, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Order.countDocuments(filter);

    let orders = await Order.find(filter)
      .populate('products.productId')
      .populate('combos.comboId')
      .populate('user_id', 'full_name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    if (q) {
      const keyword = q.toLowerCase();
      orders = orders.filter(o =>
        o._id.toString().toLowerCase().includes(keyword) ||
        (o.user_id?.full_name && o.user_id.full_name.toLowerCase().includes(keyword))
      );
    }

    res.json({
      data: orders,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4) Checkout endpoint
router.post('/checkout', async (req, res) => {
  try {
    let {
      user_id, address, paymentMethod, shippingMethod,
      selectedOrderVoucher, selectedShippingVoucher,
      products = [], shippingFee, selectedProducts
    } = req.body;

    // Nếu có products (mua ngay), xử lý riêng
    if (Array.isArray(products) && products.length > 0 && (!Array.isArray(selectedProducts) || selectedProducts.length === 0)) {
      // Xử lý giống buy-now nhưng cho phép nhiều sản phẩm
      let totalPrice = 0;
      const orderProducts = [];

      for (const item of products) {
        const prod = await Product.findById(item.productId);
        if (!prod) {
          return res.status(404).json({ error: `Sản phẩm không tồn tại.` });
        }
        if (prod.stock < item.quantity) {
          return res.status(400).json({ error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock}` });
        }
        const itemPrice = prod.price + (item.variant?.priceDiff || 0);
        const itemTotal = itemPrice * item.quantity;
        totalPrice += itemTotal;

        await Product.updateOne(
          { _id: prod._id },
          { $inc: { stock: -item.quantity } }
        );

        orderProducts.push({
          productId: prod._id,
          quantity: item.quantity,
          variant: item.variant
        });
      }

      // Áp dụng voucher cho đơn hàng (chỉ loại 'order')
      let orderVoucherDiscount = 0, orderVoucherId = null;
      if (selectedOrderVoucher && selectedOrderVoucher.code) {
        const voucherDoc = await Voucher.findOne({ code: selectedOrderVoucher.code.toUpperCase() });
        if (voucherDoc && voucherDoc.apply_for === 'order') {
          const validation = validateVoucherConditions(voucherDoc, totalPrice);
          if (!validation.valid) return res.status(400).json({ error: validation.message });
          orderVoucherDiscount = calculateDiscountAmount(voucherDoc, totalPrice);
          orderVoucherId = voucherDoc._id;
        }
      }

      // Áp dụng voucher cho phí vận chuyển (chỉ loại 'shipping')
      let shippingVoucherDiscount = 0, shippingVoucherId = null;
      if (selectedShippingVoucher && selectedShippingVoucher.code) {
        const voucherDoc = await Voucher.findOne({ code: selectedShippingVoucher.code.toUpperCase() });
        if (voucherDoc && voucherDoc.apply_for === 'shipping') {
          const validation = validateVoucherConditions(voucherDoc, shippingFee);
          if (!validation.valid) return res.status(400).json({ error: validation.message });
          shippingVoucherDiscount = calculateDiscountAmount(voucherDoc, shippingFee);
          shippingVoucherId = voucherDoc._id;
        }
      }

      // Tính phí vận chuyển sau giảm
      const finalShippingFee = Math.max(0, shippingFee - shippingVoucherDiscount);

      // Tổng cuối cùng
      const finalTotal = Math.max(0, totalPrice - orderVoucherDiscount + finalShippingFee);

      // Tạo đơn hàng
      const order = new Order({
        user_id,
        products: orderProducts,
        address,
        paymentMethod,
        shippingMethod,
        voucher: orderVoucherId, // voucher đơn hàng
        voucherDiscount: orderVoucherDiscount,
        shippingVoucher: shippingVoucherId, // voucher phí vận chuyển
        shippingVoucherDiscount: shippingVoucherDiscount,
        shippingFee: finalShippingFee,
        total_price: totalPrice,
        total: finalTotal,
        status: 'pending'
      });
      await order.save();

      return res.status(200).json({
        message: 'Đặt hàng thành công',
        orderId: order._id,
        amount: order.total,
        voucherDiscount: order.voucherDiscount || 0,
        shippingVoucherDiscount: order.shippingVoucherDiscount || 0,
        shippingFee: order.shippingFee || 0,
        des: order._id.toString(),
      }); // THÊM return ở đây
    }

    // Nếu không có products, xử lý như cũ (giỏ hàng)
    const cart = await Cart.findOne({ user_id })
      .populate('products.productId')
      .populate('products.comboId');

    if (!cart || !cart.products.length) {
      return res.status(400).json({ error: 'Giỏ hàng trống' }); // THÊM return
    }

    // Lọc sản phẩm được chọn
    let checkoutProducts = cart.products;
    if (Array.isArray(selectedProducts) && selectedProducts.length > 0) {
      // Lấy mảng _id từ selectedProducts
      let selectedIds = [];
      if (selectedProducts.length > 0 && typeof selectedProducts[0] === 'object' && selectedProducts[0].cartItemId) {
        selectedIds = selectedProducts.map(p => p.cartItemId);
      } else {
        selectedIds = selectedProducts.map(id => id.toString());
      }

      // Lọc sản phẩm được chọn
      checkoutProducts = cart.products;
      if (selectedIds.length > 0) {
        checkoutProducts = cart.products.filter(item =>
          selectedIds.includes(item._id.toString())
        );
      }
    }

    if (!checkoutProducts.length) {
      return res.status(400).json({ error: 'Không có sản phẩm nào được chọn để thanh toán' }); // THÊM return
    }

    // Tính tổng tiền + kiểm tra tồn kho
    let totalPrice = 0;
    const orderProducts = [];
    const orderCombos = [];

    for (const item of checkoutProducts) {
      if (item.productId) {
        const prod = item.productId;
        const itemPrice = prod.price + (item.variant?.priceDiff || 0);
        const itemTotal = itemPrice * item.quantity;

        // Log chi tiết từng sản phẩm
        console.log('[CHECKOUT] Sản phẩm:', {
          name: prod.name,
          productId: prod._id,
          price: prod.price,
          variant: item.variant,
          priceDiff: item.variant?.priceDiff || 0,
          itemPrice,
          quantity: item.quantity,
          itemTotal
        });

        if (prod.stock < item.quantity) {
          return res.status(400).json({ error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock}` }); // THÊM return
        }
        totalPrice += itemTotal;

        await Product.updateOne(
          { _id: prod._id },
          { $inc: { stock: -item.quantity } }
        );

        orderProducts.push({
          productId: prod._id,
          quantity: item.quantity,
          variant: item.variant
        });
      } else if (item.comboId) {
        const combo = item.comboId;
        const comboProducts = await Product.find({ _id: { $in: combo.productIds } });
        for (const prod of comboProducts) {
          if (prod.stock < item.quantity) {
            return res.status(400).json({ error: `Sản phẩm ${prod.name} trong combo chỉ còn ${prod.stock}` });
          }
        }
        for (const prod of comboProducts) {
          await Product.updateOne(
            { _id: prod._id },
            { $inc: { stock: -item.quantity } }
          );
        }

        const comboTotal = combo.price * item.quantity;

        // Log chi tiết từng combo
        console.log('[CHECKOUT] Combo:', {
          comboId: combo._id,
          name: combo.name,
          price: combo.price,
          quantity: item.quantity,
          comboTotal
        });

        totalPrice += comboTotal;
        orderCombos.push({
          comboId: combo._id,
          quantity: item.quantity,
          price: combo.price
        });
      }
    }

    // Thêm dòng này để lấy voucher từ request
    const voucher = req.body.selectedOrderVoucher || null;

    // Sau khi tính totalPrice (giá gốc + biến thể)
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

    // Phí ship
    // Chỉ cần gán lại, không khai báo lại
    if (typeof req.body.shippingFee === 'number') {
      shippingFee = req.body.shippingFee;
    }

    // Tổng cuối cùng
    const finalTotal = Math.max(0, totalPrice + shippingFee - voucherDiscount);

    // Log thông tin chi tiết trước khi tạo đơn hàng
    console.log('totalPrice:', totalPrice);
    console.log('voucherDiscount:', voucherDiscount);
    console.log('shippingFee:', shippingFee);
    console.log('finalTotal:', finalTotal);

    // Tạo đơn hàng
    const order = new Order({
      user_id,
      products: orderProducts,
      combos: orderCombos,
      address,
      paymentMethod,
      shippingMethod,
      voucher,
      voucherDiscount,
      shippingFee,
      total_price: totalPrice,
      total: finalTotal,
      status: 'pending'
    });
    await order.save();

    // Xóa các sản phẩm đã checkout khỏi giỏ hàng dựa trên cartItemId
    if (Array.isArray(selectedProducts) && selectedProducts.length > 0) {
      // Thêm log để debug
      console.log('selectedProducts:', selectedProducts);
      console.log('cart.products:', cart.products.map(i => i._id.toString()));

      let selectedIds = [];
      if (typeof selectedProducts[0] === 'object' && selectedProducts[0].cartItemId) {
        selectedIds = selectedProducts.map(p => p.cartItemId.toString());
      } else {
        selectedIds = selectedProducts.map(id => id.toString());
      }
      cart.products = cart.products.filter(item =>
        !selectedIds.includes(item._id.toString())
      );
      await cart.save();
    }

    // Tự động hủy đơn hàng pending sau 10 phút nếu chưa thanh toán
    setInterval(async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      try {
        const expiredOrders = await Order.find({
          status: 'pending',
          createdAt: { $lte: tenMinutesAgo }
        });

        for (const order of expiredOrders) {
          // Trả lại kho cho từng sản phẩm
          for (const p of order.products) {
            await Product.updateOne(
              { _id: p.productId },
              { $inc: { stock: p.quantity } }
            );
          }
          // Trả lại kho cho combo nếu có
          for (const c of order.combos || []) {
            const combo = await Combo.findById(c.comboId);
            if (combo) {
              for (const pid of combo.productIds) {
                await Product.updateOne(
                  { _id: pid },
                  { $inc: { stock: c.quantity } }
                );
              }
            }
          }
          order.status = 'cancelled';
          order.cancelledAt = new Date();
          await order.save();
          console.log(`Order ${order._id} auto-cancelled after 10 minutes`);
        }
      } catch (err) {
        console.error('Auto cancel orders error:', err);
      }
    }, 60 * 1000); // Kiểm tra mỗi phút

    // Trả về response
    res.status(200).json({
      message: 'Đặt hàng thành công',
      orderId: order._id,
      amount: order.total,
      voucherDiscount: order.voucherDiscount || 0,
      shippingVoucherDiscount: order.shippingVoucherDiscount || 0,
      shippingFee: order.shippingFee || 0,
      des: order._id.toString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

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
router.get('/user/:userId', async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.params.userId })
                              .populate('products.productId')
                              .populate('combos.comboId');
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
router.get('/:id/pay-info', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.status !== 'pending') {
      return res.status(404).json({ error: 'Đơn hàng không tồn tại hoặc đã thanh toán' });
    }

    res.json({
      orderId: order._id,
      acc: '123456789',          // số tài khoản nhận
      bank: 'VCB',               // mã ngân hàng
      amount: order.total,
      des: order._id.toString(), // để webhook mapping
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7) Update order status
router.put('/:orderId/status', orderCtrl.updateStatus);

// 8) Cancel order
router.put('/:orderId/cancel', orderCtrl.cancelOrder);

// 9) Return stock for cancelled order
router.post('/:orderId/return-stock', orderCtrl.returnStockForCancelledOrder);

// 10) Update order (general update)
router.put('/:id', async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
      .populate('products.productId')
      .populate('combos.comboId');
    
    if (!updated) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }
    
    res.json(updated);
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 11) Get order by ID - MUST be last among GET routes
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user_id', 'full_name phone email')
      .populate('products.productId', 'name price image')
      .populate('combos.comboId')
      .lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }
    
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;