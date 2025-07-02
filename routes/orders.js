const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const ctrl = require('../controllers/orderCtrl');

// Các route cụ thể đặt trước
router.get('/status-tabs', (req, res) => {
  res.json([
    { key: 'pending', label: 'Chờ xác nhận', icon: 'clock-outline' },
    { key: 'confirmed', label: 'Chờ lấy hàng', icon: 'truck-outline' },
    { key: 'packed', label: 'Đã đóng gói', icon: 'package-variant-closed' },
    { key: 'picked', label: 'Đã lấy hàng', icon: 'cube-send' },
    { key: 'shipping', label: 'Đang giao', icon: 'truck-fast-outline' },
    { key: 'delivered', label: 'Đã giao', icon: 'check-circle-outline' },
    { key: 'cancelled', label: 'Đã huỷ', icon: 'close-circle-outline' },
  ]);
});

// Lấy tất cả đơn của user (bao gồm cả pending)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await Order.find({ user_id: userId })
      .populate('products.productId')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Thêm sản phẩm vào giỏ hàng (pending, cộng dồn nếu đã có)
router.post('/add-to-cart', async (req, res) => {
  const { user_id, productId, quantity } = req.body;
  if (!user_id || !productId) return res.status(400).json({ error: 'Missing user_id or productId' });

  let order = await Order.findOne({ user_id, status: 'pending' });
  if (!order) {
    order = new Order({
      user_id,
      status: 'pending',
      products: [{ productId, quantity }]
    });
  } else {
    const prod = order.products.find(p => p.productId.toString() === productId);
    if (prod) {
      prod.quantity += quantity;
    } else {
      order.products.push({ productId, quantity });
    }
  }
  await order.save();
  const populatedOrder = await Order.findById(order._id).populate('products.productId');
  res.json(populatedOrder);
});

// Cập nhật số lượng sản phẩm trong giỏ hàng
router.put('/update-quantity', async (req, res) => {
  const { user_id, productId, quantity } = req.body;
  const order = await Order.findOne({ user_id, status: 'pending', "products.productId": productId });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const prod = order.products.find(p => p.productId.toString() === productId);
  if (prod) prod.quantity = quantity;
  await order.save();

  const populatedOrder = await Order.findById(order._id).populate('products.productId');
  res.json(populatedOrder);
});

// Xóa sản phẩm khỏi giỏ hàng
router.delete('/remove-product/:user_id/:productId', async (req, res) => {
  const { user_id, productId } = req.params;
  const order = await Order.findOne({ user_id, status: 'pending', "products.productId": productId });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.products = order.products.filter(p => p.productId.toString() !== productId);
  await order.save();

  const populatedOrder = await Order.findById(order._id).populate('products.productId');
  res.json(populatedOrder);
});

// Checkout: xác nhận đơn hàng, chuyển trạng thái, giữ lại lịch sử
router.post('/checkout', async (req, res) => {
  try {
    const { user_id, address, paymentMethod, shippingMethod, voucher, total } = req.body;
    // Đổi trạng thái đơn pending thành đã đặt hàng
    const order = await Order.findOneAndUpdate(
      { user_id, status: 'pending' },
      {
        $set: {
          status: 'confirmed',
          address,
          paymentMethod,
          shippingMethod,
          voucher,
          total,
          createdAt: new Date()
        }
      },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'No pending order found' });
    res.status(201).json({ message: 'Đặt hàng thành công', orderId: order._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Các route động đặt sau cùng

// GET 1 đơn theo ID
router.get('/:orderId', ctrl.getOrderById);

// POST tạo đơn (chung cho admin)
router.post('/', ctrl.createOrder);

// PUT cập nhật thông tin đơn (không chỉ status)
router.put('/:orderId', ctrl.updateOrder);

// PUT cập nhật thông tin đơn
router.put('/:orderId/status', ctrl.updateStatus);

// DELETE xóa hẳn (với admin)
router.delete('/:orderId', ctrl.deleteOrder);

// GET all orders (admin)
router.get('/', async (req, res) => {
  try {
    const { status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;

    let orders = await Order.find(filter)
      .populate('user_id', 'full_name')
      .populate('products.productId', 'name price image')
      .sort({ createdAt: -1 })
      .lean();

    if (q) {
      const term = q.toLowerCase();
      orders = orders.filter(o =>
        o._id.toString().includes(term) ||
        (o.user_id && o.user_id.full_name && o.user_id.full_name.toLowerCase().includes(term))
      );
    }

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;