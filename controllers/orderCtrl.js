const Order = require('../models/Order');

// Tạo mới đơn hàng
exports.createOrder = async (req, res) => {
  try {
    const payload = {
      user_id: req.body.user_id,
      products: req.body.products,
      total_price: req.body.total_price,
      address: req.body.address,
      paymentMethod: req.body.paymentMethod,
      shippingMethod: req.body.shippingMethod,
      voucher: req.body.voucher,
      total: req.body.total
    };
    const order = new Order(payload);
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Lấy danh sách đơn hàng của 1 user
exports.getOrdersByUser = async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.params.userId })
      .populate('products.productId', 'name price image')
      .sort({ order_date: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cập nhật trạng thái đơn hàng
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending','confirmed','shipping','delivered','returned','cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn' });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Hủy đơn (chuyển status thành cancelled)
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn' });
    // chỉ cho hủy khi đang ở trạng thái pending hoặc confirmed
    if (!['pending','confirmed'].includes(order.status)) {
      return res.status(400).json({ error: 'Không thể hủy đơn ở trạng thái hiện tại' });
    }
    order.status = 'cancelled';
    await order.save();
    res.json({ message: 'Đã hủy đơn', order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
