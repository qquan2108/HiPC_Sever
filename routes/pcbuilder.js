const express = require('express');
const router = express.Router();
const Build = require('../models/Build');
const BuildProduct = require('../models/BuildProduct');
const Product = require('../models/Product');
const { calculateTotalPrice, estimatePerformance, checkCompatibility } = require('../utils/pcBuilders');
const mongoose = require('mongoose');

const PRESET_BUILDS = [
  { type: 'gaming', name: 'Gaming PC', description: 'Cấu hình chơi game', components: [] },
  { type: 'workstation', name: 'Workstation', description: 'Cấu hình làm việc', components: [] },
  { type: 'budget', name: 'Budget', description: 'Tiết kiệm chi phí', components: [] }
];

router.get('/presets', (req, res) => {
  res.json(PRESET_BUILDS);
});

router.post('/build', async (req, res) => {
  try {
    const user_id = req.body.userId || req.body.user_id;
    const { name, products } = req.body;

    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: 'userId không hợp lệ (phải là ObjectId MongoDB)' });
    }

    if (!user_id || !products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Thiếu thông tin user hoặc sản phẩm.' });
    }

    const ids = products.map(p => p.productId);
    const productDocs = await Product.find({ _id: { $in: ids } }).lean();
    const items = productDocs.map(doc => {
      const qty = products.find(p => p.productId == doc._id.toString())?.quantity || 1;
      return { ...doc, quantity: qty };
    });
    const totalPrice = calculateTotalPrice(items);
    const performance = estimatePerformance(items);
    const compatibility = checkCompatibility(items);
    const build = new Build({ user_id, name, total_price: totalPrice, status: 'draft' });
    await build.save();
    for (const p of products) {
      await new BuildProduct({ build_id: build._id, product_id: p.productId, quantity: p.quantity }).save();
    }
    res.status(201).json({ buildId: build._id, totalPrice, performance, compatibility });
  } catch (err) {
    console.error('Lỗi khi tạo build:', err); // Thêm dòng này để log lỗi chi tiết
    res.status(500).json({ error: err.message });
  }
});

// Lấy tất cả build của user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'userId không hợp lệ.' });
    }
    const builds = await Build.find({ user_id: userId }).sort({ createdAt: -1 });
    res.json(builds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lấy chi tiết build theo id
router.get('/:buildId', async (req, res) => {
  try {
    const { buildId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(buildId)) {
      return res.status(400).json({ error: 'buildId không hợp lệ.' });
    }
    const build = await Build.findById(buildId);
    if (!build) return res.status(404).json({ error: 'Không tìm thấy build.' });

    // Lấy danh sách sản phẩm trong build
    const products = await BuildProduct.find({ build_id: buildId }).populate('product_id');
    res.json({ build, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;