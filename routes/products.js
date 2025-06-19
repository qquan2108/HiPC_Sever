// routes/product.js
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

// GET product chi tiết (có đầy đủ images array)
router.get('/:id', async (req, res) => {
  try {
    const item = await Product.findById(req.params.id)
      .populate('category_id')
      .populate('brand_id')
      .lean();
    if (!item) return res.status(404).json({ error: 'Not found' });

    const images = await Image.find({ product_id: item._id });
    res.json({
      ...item,
      image: images[0] ? images[0].url : null,
      images: images.map(img => img.url),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create product + tạo ảnh đại diện
router.post('/', async (req, res) => {
  try {
    // tách riêng url image khỏi phần dữ liệu product
    const { image: imageUrl, ...productData } = req.body;
    const newItem = new Product(productData);
    await newItem.save();

    // nếu có imageUrl thì lưu vào collection Image
    if (imageUrl) {
      await Image.create({ url: imageUrl, product_id: newItem._id });
    }

    // đọc lại image để trả về
    const imgDoc = await Image.findOne({ product_id: newItem._id });
    res.status(201).json({
      ...newItem.toObject(),
      image: imgDoc ? imgDoc.url : null
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update product + cập nhật hoặc tạo mới ảnh
router.put('/:id', async (req, res) => {
  try {
    const { image: imageUrl, ...productData } = req.body;
    // cập nhật product
    const updatedItem = await Product.findByIdAndUpdate(req.params.id, productData, { new: true });

    // xử lý image
    if (imageUrl) {
      // nếu đã có ảnh rồi thì update, chưa thì tạo mới
      await Image.findOneAndUpdate(
        { product_id: updatedItem._id },
        { url: imageUrl },
        { upsert: true, new: true }
      );
    }

    // trả về luôn url ảnh
    const imgDoc = await Image.findOne({ product_id: updatedItem._id });
    res.json({
      ...updatedItem.toObject(),
      image: imgDoc ? imgDoc.url : null
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE product + xóa cả ảnh liên quan
router.delete('/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    await Image.deleteMany({ product_id: req.params.id });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
