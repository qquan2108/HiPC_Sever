const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Image = require('../models/Image'); // Add this at the top

// Thêm sản phẩm vào giỏ hàng (cộng dồn nếu đã có)
router.post('/add-to-cart', async (req, res) => {
  const { user_id, productId, quantity } = req.body;
  let order = await Order.findOne({ user_id, status: 'pending' });
  if (!order) {
    order = new Order({ user_id, products: [{ productId, quantity }], status: 'pending' });
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
router.delete('/remove-product/:userId/:productId', async (req, res) => {
  const { userId, productId } = req.params;
  const order = await Order.findOne({ user_id: userId, status: 'pending' });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.products = order.products.filter(p => p.productId.toString() !== productId);
  await order.save();
  const populatedOrder = await Order.findById(order._id).populate('products.productId');
  res.json(populatedOrder);
});

// Lấy danh sách đơn hàng của user
router.get('/user/:userId', async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.params.userId })
      .populate('products.productId');
    // Attach image URL to each product
    for (const order of orders) {
      for (const prod of order.products) {
        if (prod.productId && prod.productId._id) {
          const img = await Image.findOne({ product_id: prod.productId._id });
          prod.productId.image = img ? img.url : null;
        }
      }
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Đặt hàng (checkout)
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
      status: 'confirmed',
      createdAt: new Date()
    });
    await newOrder.save();
    // XÓA GIỎ HÀNG (chỉ xóa đơn hàng pending của user)
    await Order.deleteMany({ user_id, status: 'pending' });
    res.status(201).json({ message: 'Đặt hàng thành công', orderId: newOrder._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Các route động đặt sau cùng

// GET by id
router.get('/:id', async (req, res) => {
  try {
    const item = await Order.findById(req.params.id).populate('products.productId');
    res.json(item);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('products.productId');
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET all
router.get('/', async (req, res) => {
  try {
    const items = await Order.find().populate('products.productId');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;