const express = require('express');
const router = express.Router();
const Build = require('../models/Build');
const BuildProduct = require('../models/BuildProduct');
const Product = require('../models/Product');
const { calculateTotalPrice, estimatePerformance, checkCompatibility } = require('../utils/pcBuilders');

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
    const { userId, name, products } = req.body;
    const ids = products.map(p => p.productId);
    const productDocs = await Product.find({ _id: { $in: ids } }).lean();
    const items = productDocs.map(doc => {
      const qty = products.find(p => p.productId == doc._id.toString())?.quantity || 1;
      return { ...doc, quantity: qty };
    });
    const totalPrice = calculateTotalPrice(items);
    const performance = estimatePerformance(items);
    const compatibility = checkCompatibility(items);
    const build = new Build({ user_id: userId, name, total_price: totalPrice, status: 'draft' });
    await build.save();
    for (const p of products) {
      await new BuildProduct({ build_id: build._id, product_id: p.productId, quantity: p.quantity }).save();
    }
    res.status(201).json({ buildId: build._id, totalPrice, performance, compatibility });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;