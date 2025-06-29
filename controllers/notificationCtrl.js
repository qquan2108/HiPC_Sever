const Notification = require('../models/Notification');

// Tạo thông báo mới
exports.create = async (req, res) => {
  try {
    const { type, title, message } = req.body;
    const notif = await Notification.create({ type, title, message });
    res.status(201).json(notif);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Lấy danh sách thông báo
exports.list = async (req, res) => {
  try {
    const notifs = await Notification.find().sort({ createdAt: -1 });
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
