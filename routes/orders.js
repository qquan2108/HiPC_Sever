const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

// Các route cụ thể đặt trước

    //admin
// Danh sách tab trạng thái
router.get('/status-tabs', (req, res) => {
  res.json([
    { key: '',          label: 'Tất cả'       },
    { key: 'pending',   label: 'Chờ duyệt'    },
    { key: 'confirmed', label: 'Đã xác nhận' },
    { key: 'shipped',   label: 'Đã giao hàng'},
    { key: 'delivered', label: 'Đã nhận'      },
    { key: 'return_requested', label: 'Yêu cầu hủy'      },
    { key: 'canceled',  label: 'Đã hủy'       },
  ]);
});

// Trả về mảng đơn hàng, đã populate tên khách
router.get('/', async (req, res) => {
  try {
    const { status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;

    if (q) {
      // Tìm theo ID hoặc tên khách (chia trường hợp)
      filter.$or = [
        { _id: q },
        { 'user_id.full_name': { $regex: q, $options: 'i' } }
      ];
    }

    const orders = await Order.find(filter)
      .populate('user_id', 'full_name')
      .sort({ order_date: -1 });

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server, không lấy được đơn hàng' });
  }
});

// Cập nhật số lượng sản phẩm trong giỏ hàng
router.put('/update-quantity', async (req, res) => {
  console.log('BODY:', req.body);
  const { productId, quantity } = req.body;

  // Tìm order chứa sản phẩm này
  const order = await Order.findOne({ "products.productId": productId });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const prod = order.products.find(p => p.productId.toString() === productId);
  if (prod) prod.quantity = quantity;
  await order.save();

  // Trả về order đã populate
  const populatedOrder = await Order.findById(order._id).populate('products.productId');
  res.json(populatedOrder);
});

// Xóa sản phẩm khỏi giỏ hàng
router.delete('/remove-product/:productId', async (req, res) => {
  const { productId } = req.params;
  const order = await Order.findOne({ "products.productId": productId });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.products = order.products.filter(p => p.productId.toString() !== productId);
  await order.save();

  const populatedOrder = await Order.findById(order._id).populate('products.productId');
  res.json(populatedOrder);
});

// Thêm sản phẩm vào giỏ hàng (cộng dồn nếu đã có)
router.post('/add-to-cart', async (req, res) => {
  const { productId, quantity } = req.body;
  let order = await Order.findOne(); // Thêm điều kiện user nếu có
  if (!order) {
    order = new Order({ products: [{ productId, quantity }] });
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
router.post('/checkout', async (req, res) => {
  try {
    const { products, address, paymentMethod, shippingMethod, voucher, total } = req.body;
    // Tạo đơn hàng mới
    const newOrder = new Order({
      products,
      address,
      paymentMethod,
      shippingMethod,
      voucher,
      total,
      createdAt: new Date()
    });
    await newOrder.save();

    // XÓA GIỎ HÀNG (giả sử chỉ có 1 order là giỏ hàng)
    await Order.deleteMany({ /* điều kiện là giỏ hàng, ví dụ type: 'cart' hoặc user_id nếu có */ });

    res.status(201).json({ message: 'Đặt hàng thành công', orderId: newOrder._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
