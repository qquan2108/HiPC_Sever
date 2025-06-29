const Banner = require('../models/Banner');

// Lấy danh sách banner active
exports.getAll = async (req, res, next) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort('-createdAt');
    res.json(banners);
  } catch (err) {
    next(err);
  }
};

// Tạo banner mới (chỉ khi đã có imageUrl)
exports.create = async (req, res, next) => {
  try {
    const { title, imageUrl, link } = req.body;
    const banner = new Banner({ title, imageUrl, link });
    await banner.save();
    res.status(201).json(banner);
  } catch (err) {
    next(err);
  }
};

// Xóa banner
exports.delete = async (req, res, next) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Upload file image
exports.uploadImage = (req, res) => {
  try {
    if (!req.file) throw new Error('No file');
    const url = `/uploads/banners/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
};

