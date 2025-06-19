// routes/ordersRouter.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');

// --- 1. Các route “đặc biệt”, phải nằm trên cùng ---

// Lấy danh sách đơn hàng của user
router.get('/user/:userId', async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.params.userId })
      .sort({ order_date: -1 })                                       // mới nhất lên trước
      .populate({
        path: 'products.productId',                                   // chỉ populate Product
       select: 'name price image',                                         // chỉ những field cần thiết
      })
      .populate('voucher');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Checkout (đặt hàng)
router.post('/checkout', async (req, res) => {
  try {
    const { user_id, products, address, paymentMethod, shippingMethod, voucher, total } = req.body;
    const newOrder = new Order({
      user_id,
      products,
      address,
      paymentMethod,
      shippingMethod,
      voucher,
      total,
      status: 'pending',
      order_date: new Date()
    });
    await newOrder.save();
    res.status(201).json({ message: 'Đặt hàng thành công', orderId: newOrder._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Thêm sản phẩm vào giỏ hàng (đơn pending của user)
router.post('/add-to-cart', async (req, res) => {
  const { user_id, productId, quantity } = req.body;
  let order = await Order.findOne({ user_id, status: 'pending' });
  if (!order) {
    order = new Order({ user_id, products: [{ productId, quantity }] });
  } else {
    const p = order.products.find(p => p.productId.toString() === productId);
    if (p) p.quantity += quantity;
    else order.products.push({ productId, quantity });
  }
  await order.save();
  const populated = await Order.findById(order._id).populate('products.productId');
  res.json(populated);
});

// Cập nhật số lượng trong giỏ hàng
router.put('/update-quantity', async (req, res) => {
  const { user_id, productId, quantity } = req.body;
  const order = await Order.findOne({ user_id, status: 'pending', 'products.productId': productId });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const prod = order.products.find(p => p.productId.toString() === productId);
  prod.quantity = quantity;
  await order.save();
  const populated = await Order.findById(order._id).populate('products.productId');
  res.json(populated);
});

// Xóa sản phẩm khỏi giỏ hàng
router.delete('/remove-product/:userId/:productId', async (req, res) => {
  const { userId, productId } = req.params;
  const order = await Order.findOne({ user_id: userId, status: 'pending' });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.products = order.products.filter(p => p.productId.toString() !== productId);
  await order.save();
  const populated = await Order.findById(order._id).populate('products.productId');
  res.json(populated);
});

// --- 2. Các route hành động chuyển trạng thái ---

// Xác nhận (admin)
router.put('/:id/confirm', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed', confirmedAt: new Date() },
      { new: true }
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chuyển sang giao hàng (admin)
router.put('/:id/ship', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'shipping', shippedAt: new Date() },
      { new: true }
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xác nhận đã nhận hàng (user)
router.put('/:id/deliver', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'delivered', deliveredAt: new Date() },
      { new: true }
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hủy đơn (user hoặc admin)
router.put('/:id/cancel', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    // Restock
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
    }
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trả hàng (user)
router.put('/:id/return', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
    }
    order.status = 'returned';
    order.returnedAt = new Date();
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 3. Các route chung / động, đặt sau cùng ---

// GET order theo id
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('products.productId voucher');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cập nhật chung
router.put('/:id', async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('products.productId');
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Xóa chung
router.delete('/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET tất cả
router.get('/', async (req, res) => {
  try {
    const items = await Order.find().populate('products.productId');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
