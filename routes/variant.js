const express = require('express');
const router = express.Router();
const VariantProduct = require('../models/Variantproduct');
const mongoose = require('mongoose');

// Tạo mới một biến thể sản phẩm
router.post('/create', async (req, res) => {
  try {
    const { product_id, order_id, name, price, stock, image } = req.body;

    // Kiểm tra product_id hợp lệ
    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ error: 'product_id không hợp lệ' });
    }

    const variant = new VariantProduct({
      product_id,
      name,
      price,
      stock
    });

    await variant.save();
    res.status(201).json({ message: 'Tạo biến thể thành công', variant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lấy danh sách biến thể theo productId
router.get('/by-product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'productId không hợp lệ' });
    }
    const variants = await VariantProduct.find({ product_id: productId });
    res.json(variants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;