// routes/orders.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Image = require('../models/Image');
const Product = require('../models/Product');

// 1) Thêm sản phẩm vào giỏ hàng (cộng dồn nếu đã có)
router.post('/add-to-cart', async (req, res) => {
  const { user_id, productId, quantity } = req.body;
  let order = await Order.findOne({ user_id, status: 'pending' });
  if (!order) {
    order = new Order({ user_id, products: [{ productId, quantity }], status: 'pending' });
  } else {
    const prod = order.products.find(p => p.productId.toString() === productId);
    prod ? prod.quantity += quantity : order.products.push({ productId, quantity });
  }
  await order.save();
  const populated = await Order.findById(order._id).populate('products.productId');
  res.json(populated);
});

// 2) Cập nhật số lượng trong giỏ hàng
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

// 3) Xóa sản phẩm khỏi giỏ hàng
router.delete('/remove-product/:userId/:productId', async (req, res) => {
  const { userId, productId } = req.params;
  const order = await Order.findOne({ user_id: userId, status: 'pending' });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.products = order.products.filter(p => p.productId.toString() !== productId);
  await order.save();

  const populated = await Order.findById(order._id).populate('products.productId');
  res.json(populated);
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
    const { user_id, address, paymentMethod, shippingMethod, voucher, total } = req.body;
    const order = await Order.findOne({ user_id, status: 'pending' });
    if (!order || !order.products.length) {
      return res.status(400).json({ error: 'Giỏ hàng trống' });
    }

    // Kiểm tra và trừ stock atomic
    for (const item of order.products) {
      const prod = await Product.findById(item.productId).select('stock name');
      if (!prod) {
        return res.status(400).json({ error: `Không tìm thấy sản phẩm ${item.productId}` });
      }
      if (prod.stock < item.quantity) {
        return res.status(400).json({ error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock}` });
      }
      await Product.updateOne(
        { _id: item.productId },
        { $inc: { stock: -item.quantity } }
      );
    }

    // Cập nhật đơn thành confirmed
    order.address        = address;
    order.paymentMethod  = paymentMethod;
    order.shippingMethod = shippingMethod;
    order.voucher        = voucher;
    order.total          = total;
    order.status         = 'confirmed';
    order.createdAt      = new Date();
    await order.save();

    res.status(200).json({ message: 'Đặt hàng thành công', orderId: order._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 6) Hủy đơn và hoàn stock
// QUAN TRỌNG: Route này phải đặt TRƯỚC route PUT '/:id' generic
router.put('/:id/cancel', async (req, res) => {
  try {
    console.log('Cancel order ID:', req.params.id); // Debug log
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      console.log('Order not found for ID:', req.params.id);
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }

    console.log('Current order status:', order.status); // Debug log
    
    // Kiểm tra trạng thái đơn hàng
    if (!['pending', 'confirmed'].includes(order.status)) {
      console.log('Invalid status for cancellation:', order.status);
      return res.status(400).json({ 
        error: `Không thể hủy đơn hàng với trạng thái: ${order.status}. Chỉ có thể hủy đơn ở trạng thái 'Chờ xác nhận' hoặc 'Chờ lấy hàng'` 
      });
    }

    // Hoàn stock cho từng sản phẩm (chỉ khi đơn đã confirmed)
    if (order.status === 'confirmed' && order.products && order.products.length > 0) {
      for (const item of order.products) {
        try {
          const result = await Product.updateOne(
            { _id: item.productId },
            { $inc: { stock: item.quantity } }
          );
          console.log(`Updated stock for product ${item.productId}:`, result);
        } catch (stockError) {
          console.error('Error updating stock:', stockError);
          // Tiếp tục với các sản phẩm khác thay vì dừng
        }
      }
    }

    // Cập nhật trạng thái đơn hàng
    order.status = 'cancelled';
    order.cancelledAt = new Date(); // Thêm timestamp khi hủy
    await order.save();

    // Populate dữ liệu trước khi trả về
    const populatedOrder = await Order.findById(order._id).populate('products.productId');
    
    console.log('Order cancelled successfully:', order._id);
    res.json({ 
      message: 'Hủy đơn hàng thành công', 
      order: populatedOrder 
    });

  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).json({ 
      error: 'Lỗi server khi hủy đơn hàng',
      details: err.message 
    });
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

// 9) Lấy tất cả đơn (GET /orders)
router.get('/', async (req, res) => {
  try {
    const items = await Order.find().populate('products.productId');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
