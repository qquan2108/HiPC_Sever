const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const ctrl = require('../controllers/orderCtrl')

// Các route cụ thể đặt trước

//admin

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
    // order.status         = 'confirmed';
    order.createdAt      = new Date();
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
    return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
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
