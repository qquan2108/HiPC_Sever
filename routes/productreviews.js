const express = require('express');
const router = express.Router();
const ProductReview = require('../models/ProductReview');

router.get('/products-with-review', async (req, res) => {
  try {
    // Giả sử bạn đã có model Product và Image
    const Product = require('../models/Product');
    const Image = require('../models/Image');
    const products = await Product.find().lean();

    const productsWithImage = await Promise.all(
      products.map(async p => {
        const img = await Image.findOne({ product_id: p._id }).lean();
        const reviews = await ProductReview.find({ product_id: p._id }).select('rating');
        const reviewCount = reviews.length;
        const avgRating = reviewCount
          ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount).toFixed(1)
          : null;

        return {
          ...p,
          image: img ? img.url : null,
          avgRating,
          reviewCount,
        };
      })
    );
    res.json(productsWithImage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all reviews, có thể filter theo product_id và user_id
router.get('/', async (req, res) => {
  try {
    const { product_id, user_id } = req.query;
    const filter = {};
    if (product_id && mongoose.Types.ObjectId.isValid(product_id)) {
      filter.product_id = mongoose.Types.ObjectId(product_id);
    }
    if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
      filter.user_id = mongoose.Types.ObjectId(user_id);
    }
    // Populate user_id để lấy full_name
    const items = await ProductReview.find(filter).populate('user_id', 'full_name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET review by id
router.get('/:id', async (req, res) => {
  try {
    const item = await ProductReview.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// POST create review
router.post('/', async (req, res) => {
  try {
    const { product_id, user_id, order_id, comment, rating, images } = req.body;
    if (!product_id || !user_id || !rating) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }
    const newItem = new ProductReview({
      product_id,
      user_id,
      order_id,
      comment, // Đúng tên trường
      rating,
      images: images || [],
      created_at: new Date()
    });
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update review
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await ProductReview.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE review
router.delete('/:id', async (req, res) => {
  try {
    await ProductReview.findByIdAndDelete(req.params.id);
    res.json({ message: 'ProductReview deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route trả về danh sách sản phẩm kèm ảnh và đánh giá



module.exports = router;