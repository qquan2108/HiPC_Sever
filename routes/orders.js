// routes/orders.js
const express = require('express');
const router = express.Router();
const orderCtrl = require('../controllers/orderCtrl');
const Order = require('../models/Order');
const Image = require('../models/Image');
const Product = require('../models/Product');


router.get('/status-tabs', (req, res) => {
  res.json([
    { key: 'pending', label: 'Chờ xác nhận', icon: 'clock-outline' },
    { key: 'confirmed', label: 'Chờ lấy hàng', icon: 'truck-outline' },
    { key: 'packed', label: 'Đã đóng gói', icon: 'package-variant-closed' },
    { key: 'picked', label: 'Đã lấy hàng', icon: 'cube-send' },
    { key: 'shipping', label: 'Đang giao', icon: 'truck-fast-outline' },
    { key: 'delivered', label: 'Đã giao', icon: 'check-circle-outline' },
    { key: 'cancelled', label: 'Đã huỷ', icon: 'close-circle-outline' },
    // Thêm các trạng thái khác nếu cần
  ]);
});
// 1) Thêm sản phẩm vào giỏ hàng (cộng dồn nếu đã có)
router.post('/add-to-cart', async (req, res) => {
  try {
    const { user_id, productId, quantity, variant } = req.body;
    // variant: { key, label, priceDiff }
    if (!user_id || !productId || !quantity || !variant?.key) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    }

    let order = await Order.findOne({ user_id, status: 'pending' });
    if (!order) {
      order = new Order({ user_id, products: [] });
    }

    const existing = order.products.find(p =>
      p.productId.toString() === productId &&
      p.variant.key === variant.key &&
      p.variant.label === variant.label
    );

    if (existing) {
      existing.quantity += quantity;
    } else {
      order.products.push({
        productId,
        quantity,
        variant: {
          key:       variant.key,
          label:     variant.label,
          priceDiff: variant.priceDiff
        }
      });
    }

    await order.save();
    const populated = await Order.findById(order._id).populate('products.productId');
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi server, vui lòng thử lại.' });
  }
});


module.exports = router;

// 2) Cập nhật số lượng trong giỏ hàng
router.put('/update-quantity', async (req, res) => {
  try {
    const { user_id, productId, variant = {}, quantity } = req.body;
    // variant phải có key và label
    const order = await Order.findOne({ user_id, status: 'pending' });
    if (!order) return res.status(404).json({ error: 'Giỏ hàng trống.' });

const item = order.products.find(p => {
      if (p.productId.toString() !== productId) return false;
      // nếu variant gửi lên có key, match thêm key & label
      if (variant.key) {
        return p.variant.key === variant.key && p.variant.label === variant.label;
      }
      return true; // hoặc chỉ match productId nếu variant không được cung cấp
    });

    item.quantity = quantity;
    await order.save();
    const populated = await Order.findById(order._id).populate('products.productId');
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// 3) Xóa sản phẩm khỏi giỏ hàng
router.delete('/remove-product', async (req, res) => {
  try {
    const { user_id, productId, variant = {} } = req.body;
    // build filter cho $pull
    const pullFilter = { productId };
    if (variant.key) {
      pullFilter['variant.key']   = variant.key;
      pullFilter['variant.label'] = variant.label;
    }

    const updated = await Order.findOneAndUpdate(
      { user_id, status: 'pending' },
      { $pull: { products: pullFilter } },
      { new: true }
    ).populate('products.productId');

    if (!updated) {
      return res.status(404).json({ error: 'Giỏ hàng trống hoặc không tìm thấy.' });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 4) Lấy danh sách đơn hàng của user
router.get('/user/:userId', async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.params.userId })
                              .populate('products.productId');
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

// 5) Checkout: duyệt đơn và trừ stock
router.post('/checkout', async (req, res) => {
  try {
    const { user_id, address, paymentMethod, shippingMethod, voucher } = req.body;
    const order = await Order.findOne({ user_id, status: 'pending' }).populate('products.productId');
    if (!order || !order.products.length) {
      return res.status(400).json({ error: 'Giỏ hàng trống' });
    }

    // Tính tổng
    let totalPrice = 0;
    for (const item of order.products) {
      const prod = item.productId;
      const itemPrice = prod.price + (item.variant.priceDiff || 0);
      if (prod.stock < item.quantity) {
        return res.status(400).json({ error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock}` });
      }
      totalPrice += itemPrice * item.quantity;
      // Giảm stock
      await Product.updateOne(
        { _id: prod._id },
        { $inc: { stock: -item.quantity } }
      );
    }

    // Cập nhật đơn
    order.address        = address;
    order.paymentMethod  = paymentMethod;
    order.shippingMethod = shippingMethod;
    order.voucher        = voucher;
    order.total_price    = totalPrice;
    order.total          = totalPrice;
    order.status         = 'confirmed';
    await order.save();

    res.status(200).json({ message: 'Đặt hàng thành công', orderId: order._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// GET by id
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user_id', 'full_name')           
      .populate('products.productId', 'name price image')
      .lean();
    return res.json(order);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



// 7) Cập nhật chung - PHẢI ĐẶT SAU route cancel
router.put('/:id', async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('products.productId');
    
    if (!updated) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }
    
    res.json(updated);
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8) Cập nhật trạng thái đơn hàng theo workflow
router.put('/:orderId/status', orderCtrl.updateStatus);

// 9) Hủy đơn (giữ logic hoàn stock)
router.put('/:orderId/cancel', orderCtrl.cancelOrder);

// 10) Lấy tất cả đơn (GET /orders) với phân trang
router.get('/', async (req, res) => {
  try {
    const { status, q, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Order.countDocuments(filter);

    let orders = await Order.find(filter)
      .populate('products.productId')
      .populate('user_id', 'full_name')
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

router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('products.productId')
      .populate('user_id', 'full_name email');
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:orderId/return-stock', orderCtrl.returnStockForCancelledOrder);

module.exports = router;