const Notification = require('../models/Notification');
const { send } = require('../utils/notificationStream');
const push = require('../utils/pushSender');

// Tạo thông báo mới
exports.create = async (req, res) => {
  try {
    const { type, title, message, relatedOrder } = req.body;
    const notif = await Notification.create({ type, title, message, relatedOrder });
    const populated = await notif.populate({ path: 'relatedOrder', populate: { path: 'user_id', select: 'full_name' } });
    send(populated);
    // gửi push notification tới tất cả thiết bị đã đăng ký
    push.sendToAll({ title, message, data: { notificationId: notif._id } }).catch(err => {
      console.error('push error', err);
    });
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Lấy danh sách thông báo
exports.list = async (req, res) => {
  try {
    const notifs = await Notification.find()
      .sort({ createdAt: -1 })
      .populate({ path: 'relatedOrder', populate: { path: 'user_id', select: 'full_name' } });
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Đánh dấu đã đọc
exports.markRead = async (req, res) => {
  try {
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    res.json(notif);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Xóa thông báo
exports.remove = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
// Lấy thông báo chưa đọc
exports.getUnread = async (req, res) => {
  try {
    const notifs = await Notification.find({ isRead: false })
      .sort({ createdAt: -1 });
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Đánh dấu tất cả là đã đọc
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};