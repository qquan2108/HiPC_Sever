const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const VariantProduct = require('../models/Variantproduct');

// Tạo mới một biến thể sản phẩm
router.post('/create', async (req, res) => {
  try {
    const { product_id, name, price, stock } = req.body;

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

// Lấy tất cả biến thể
router.get('/', async (req, res) => {
  try {
    const view = req.query.view || 'active';
    let query = VariantProduct.find().populate('product_id', 'name');
    if (view === 'trash') query = query.onlyDeleted();
    else if (view === 'all') query = query.withDeleted();
    const variants = await query.lean();
    res.json(variants);
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
    const view = req.query.view || 'active';
    let query = VariantProduct.find({ product_id: productId }).populate('product_id', 'name');
    if (view === 'trash') query = query.onlyDeleted();
    else if (view === 'all') query = query.withDeleted();
    const variants = await query.lean();
    res.json(variants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lấy biến thể theo id
router.get('/:id', async (req, res) => {
  try {
    const variant = await VariantProduct.findById(req.params.id).withDeleted();
    if (!variant) return res.status(404).json({ error: 'Không tìm thấy biến thể' });
    res.json(variant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cập nhật biến thể
router.put('/:id', async (req, res) => {
  try {
    const { name, price, stock, product_id } = req.body;
    const update = { name, price, stock };
    if (product_id && mongoose.Types.ObjectId.isValid(product_id)) {
      update.product_id = product_id;
    }
    const variant = await VariantProduct.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!variant) return res.status(404).json({ error: 'Không tìm thấy biến thể' });
    res.json({ message: 'Cập nhật thành công', variant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa mềm biến thể
router.delete('/:id', async (req, res) => {
  try {
    const variant = await VariantProduct.findById(req.params.id).withDeleted();
    if (!variant) return res.status(404).json({ error: 'Không tìm thấy biến thể' });
    await variant.softDelete(req.user?._id);
    res.json({ message: 'Đã xóa biến thể' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Khôi phục biến thể
router.post('/:id/restore', async (req, res) => {
  try {
    const variant = await VariantProduct.findById(req.params.id).withDeleted();
    if (!variant) return res.status(404).json({ error: 'Không tìm thấy biến thể' });
    await variant.restore();
    res.json({ message: 'Đã khôi phục biến thể' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa vĩnh viễn biến thể
router.delete('/:id/purge', async (req, res) => {
  try {
    await VariantProduct.deleteOne({ _id: req.params.id });
    res.json({ message: 'Đã xóa vĩnh viễn biến thể' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

