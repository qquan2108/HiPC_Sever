const Order = require('../models/Order');
const Product = require('../models/Product');
const { canTransition } = require('../utils/orderStatus');
const Notification = require('../models/Notification');

//thong bao 
const createOrderNotification = async (order, status) => {
  let title, message, type;
  
  switch(status) {
    case 'pending':
      title = 'Đơn hàng mới';
      message = `Đơn hàng #${order._id} đã được tạo và đang chờ xử lý`;
      type = 'info';
      break;
    case 'confirmed':
      title = 'Đơn hàng đã xác nhận';
      message = `Đơn hàng #${order._id} đã được xác nhận`;
      type = 'info';
      break;
    case 'packed':
      title = 'Đơn hàng đã đóng gói';
      message = `Đơn hàng #${order._id} đã được đóng gói và chuẩn bị vận chuyển`;
      type = 'info';
      break;
    case 'shipping':
      title = 'Đơn hàng đang vận chuyển';
      message = `Đơn hàng #${order._id} đang trên đường giao đến bạn`;
      type = 'info';
      break;
    case 'delivered':
      title = 'Đơn hàng đã giao thành công';
      message = `Đơn hàng #${order._id} đã được giao thành công`;
      type = 'success';
      break;
    case 'cancelled':
      title = 'Đơn hàng đã hủy';
      message = `Đơn hàng #${order._id} đã được hủy`;
      type = 'danger';
      break;
    default:
      return;
  }

  await Notification.create({
    type,
    title,
    message,
    user_id: order.user_id,
    // Bạn có thể thêm userId nếu cần gửi thông báo cho user cụ thể
  });
};

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

 exports.getOrderById = async (req, res) => {
   const order = await Order.findById(req.params.orderId)
     .populate('user_id', 'full_name email')
     .populate('products.productId', 'name price')
     .lean();
   if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn' });
   res.json(order);
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

exports.updateOrder = async (req, res) => {
  try {
    const updates = req.body; // gồm các thuộc tính được phép sửa
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      updates,
      { new: true, runValidators: true }
    );
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};


// Cập nhật trạng thái đơn hàng với kiểm tra workflow
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    if (!canTransition(order.status, status)) {
      return res.status(400).json({ error: `Không thể chuyển từ trạng thái ${order.status} sang ${status}` });
    }

    // Nếu chuyển sang cancelled và đơn đang ở các trạng thái này, hoàn lại stock
    if (
      status === 'cancelled' &&
      ['pending', 'confirmed', 'packed', 'picked', 'shipping'].includes(order.status) &&
      order.products && order.products.length > 0
    ) {
      for (const item of order.products) {
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.quantity } }
        );
      }
    }

    order.status = status;
    await order.save();
    await createOrderNotification(order, status);
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
    // Chỉ cho phép hủy ở trạng thái chờ xác nhận và chờ lấy hàng
    if (!['pending', 'packed'].includes(order.status)) {
      return res.status(400).json({ error: 'Chỉ được hủy đơn ở trạng thái chờ xác nhận hoặc chờ lấy hàng' });
    }
    // Hoàn stock nếu đơn chưa bị hủy và có sản phẩm
    if (
      ['pending', 'packed'].includes(order.status) &&
      order.products && order.products.length > 0
    ) {
      for (const item of order.products) {
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.quantity } }
        );
      }
    }
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    await order.save();
    await createOrderNotification(order, 'cancelled');
    res.json({ message: 'Đã hủy đơn và hoàn lại kho', order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteOrder = async (req, res) => {
  res.status(403).json({ error: 'Không được phép xóa đơn hàng' });
};

exports.returnStockForCancelledOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn' });
    if (order.status !== 'cancelled') {
      return res.status(400).json({ error: 'Chỉ hoàn stock cho đơn đã hủy' });
    }
    if (order.isStockReturned) {
      return res.status(400).json({ error: 'Đơn này đã hoàn kho trước đó' });
    }
    if (!order.products || !order.products.length) {
      return res.status(400).json({ error: 'Đơn không có sản phẩm' });
    }

    // Hoàn lại stock cho từng sản phẩm
    for (const item of order.products) {
      await Product.updateOne(
        { _id: item.productId },
        { $inc: { stock: item.quantity } }
      );
    }
    order.isStockReturned = true;
    await order.save();

    res.json({ message: 'Đã hoàn lại kho cho đơn đã hủy', orderId: order._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
