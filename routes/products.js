const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Image = require('../models/Image');

// GET all products with image
router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    const productsWithImage = await Promise.all(products.map(async (p) => {
      const image = await Image.findOne({ product_id: p._id });
      return {
        ...p.toObject(),
        image: image ? image.url : null
      };
    }));
    res.json(productsWithImage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// filepath: ../routes/product.js
router.get('/:id', async (req, res) => {
  try {
    const item = await Product.findById(req.params.id)
      .populate('category_id')
      .populate('brand_id')
      .lean();

    if (!item) return res.status(404).json({ error: 'Not found' });

    // Lấy tất cả ảnh của sản phẩm
    const images = await Image.find({ product_id: item._id });

    res.json({
      ...item,
      image: images[0] ? images[0].url : null, // Ảnh đại diện
      images: images.map(img => img.url),      // Mảng tất cả ảnh
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create product
router.post('/', async (req, res) => {
  try {
    const newItem = new Product(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE product
router.delete('/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;