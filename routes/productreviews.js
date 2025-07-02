const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ProductReview = require('../models/ProductReview');
const User = require('../models/userModel');
const Order = require('../models/Order');
const Product = require('../models/Product'); // Import ở đầu file để tránh require nhiều lần
const Image = require('../models/Image'); // Import ở đầu file

// Helper function để validate ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Lấy danh sách sản phẩm kèm thông tin đánh giá
router.get('/products-with-review', async (req, res) => {
  try {
    const products = await Product.find().lean();

    const productsWithReviews = await Promise.all(
      products.map(async (product) => {
        try {
          const [image, reviews] = await Promise.all([
            Image.findOne({ product_id: product._id }).lean(),
            ProductReview.find({ product_id: product._id }).select('rating').lean()
          ]);

          const reviewCount = reviews.length;
          const avgRating = reviewCount > 0 
  ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount
  : 0;

          return {
            ...product,
            image: image ? image.url : null,
            avgRating: avgRating.toFixed(1),
            reviewCount
          };
        } catch (error) {
          console.error(`Error processing product ${product._id}:`, error);
          return {
            ...product,
            image: null,
            avgRating: '0.0',
            reviewCount: 0
          };
        }
      })
    );

    res.json(productsWithReviews);
  } catch (err) {
    console.error('Error in GET /productreviews/products-with-review:', err);
    res.status(500).json({ 
      error: 'Lỗi server khi lấy danh sách sản phẩm',
      details: err.message 
    });
  }
});

// Lấy tất cả đánh giá với filter
// Lấy tất cả đánh giá với filter (không bắt buộc user_id)
router.get('/', async (req, res) => {
  try {
    const { product_id, order_id } = req.query;
    const filter = {};
    
    // Chỉ filter theo product_id và order_id nếu có
    if (product_id && isValidObjectId(product_id)) {
      filter.product_id = product_id;
    }
    if (order_id && isValidObjectId(order_id)) {
      filter.order_id = order_id;
    }
    
    const items = await ProductReview.find(filter)
      .populate('user_id', 'full_name avatarUrl') // Vẫn populate thông tin user
      .sort({ created_at: -1 }); // Sắp xếp mới nhất trước
    
    res.json(items);
  } catch (err) {
    console.error('Error in GET /productreviews:', err);
    res.status(500).json({ 
      error: 'Lỗi server khi lấy danh sách đánh giá',
      details: err.message 
    });
  }
});

// Lấy đánh giá theo ID
router.get('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID đánh giá không hợp lệ' });
    }

    const item = await ProductReview.findById(req.params.id)
      .populate('user_id', 'full_name avatarUrl')
      .populate('product_id', 'name');

    if (!item) {
      return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
    }

    res.json(item);
  } catch (err) {
    console.error('Error in GET /productreviews/:id:', err);
    res.status(500).json({ 
      error: 'Lỗi server khi lấy thông tin đánh giá',
      details: err.message 
    });
  }
});

// Tạo đánh giá mới
// Tạo đánh giá mới hoặc cập nhật nếu đã tồn tại
router.post('/', async (req, res) => {
  try {
    const { product_id, user_id, order_id, comment, rating, images } = req.body;
    
    // Validate input
    if (!product_id || !user_id || !rating) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (product_id, user_id, rating)' });
    }

    if (!isValidObjectId(product_id)) {
      return res.status(400).json({ error: 'product_id không hợp lệ' });
    }

    if (!isValidObjectId(user_id)) {
      return res.status(400).json({ error: 'user_id không hợp lệ' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating phải từ 1 đến 5 sao' });
    }

    // Tìm đánh giá hiện có
    const existingReview = await ProductReview.findOne({ 
      product_id, 
      user_id,
      ...(order_id && { order_id })
    });

    // Nếu đã có đánh giá, cập nhật thay vì tạo mới
    if (existingReview) {
      const updatedReview = await ProductReview.findByIdAndUpdate(
        existingReview._id,
        {
          comment: comment || existingReview.comment,
          rating,
          images: Array.isArray(images) ? images : existingReview.images,
          updated_at: new Date()
        },
        { new: true }
      );

      await updateProductAverageRating(product_id);
      return res.json({
        ...updatedReview.toObject(),
        message: 'Đã cập nhật đánh giá thành công'
      });
    }

    // Nếu chưa có, tạo mới
    const newReview = new ProductReview({
      product_id,
      user_id,
      ...(order_id && { order_id }),
      comment: comment || '',
      rating,
      images: Array.isArray(images) ? images : [],
      created_at: new Date()
    });

    await newReview.save();
    await updateProductAverageRating(product_id);

    res.status(201).json(newReview);
  } catch (err) {
    console.error('Error in POST /productreviews:', err);
    res.status(500).json({ 
      error: 'Lỗi server khi tạo/cập nhật đánh giá',
      details: err.message 
    });
  }
});

// Cập nhật đánh giá
router.put('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID đánh giá không hợp lệ' });
    }

    const { rating, comment, images } = req.body;

    // Validate input
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating phải từ 1 đến 5 sao' });
    }

    const updatedReview = await ProductReview.findByIdAndUpdate(
      req.params.id,
      {
        ...(rating && { rating }),
        ...(comment !== undefined && { comment }),
        ...(images !== undefined && { images: Array.isArray(images) ? images : [] }),
        updated_at: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!updatedReview) {
      return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
    }

    // Cập nhật rating trung bình cho sản phẩm
    await updateProductAverageRating(updatedReview.product_id);

    res.json(updatedReview);
  } catch (err) {
    console.error('Error in PUT /productreviews/:id:', err);
    res.status(500).json({ 
      error: 'Lỗi server khi cập nhật đánh giá',
      details: err.message 
    });
  }
});

// Xóa đánh giá
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID đánh giá không hợp lệ' });
    }

    const review = await ProductReview.findByIdAndDelete(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
    }

    // Cập nhật rating trung bình cho sản phẩm
    await updateProductAverageRating(review.product_id);

    res.json({ message: 'Đã xóa đánh giá thành công' });
  } catch (err) {
    console.error('Error in DELETE /productreviews/:id:', err);
    res.status(500).json({ 
      error: 'Lỗi server khi xóa đánh giá',
      details: err.message 
    });
  }
});

// Lấy đánh giá theo sản phẩm
router.get('/by-product/:product_id', async (req, res) => {
  try {
    const { product_id } = req.params;

    if (!isValidObjectId(product_id)) {
      return res.status(400).json({ error: 'product_id không hợp lệ' });
    }

    const reviews = await ProductReview.find({ product_id })
      .populate('user_id', 'full_name avatarUrl')
      .sort({ created_at: -1 });

    res.json(reviews);
  } catch (err) {
    console.error('Error in GET /productreviews/by-product/:product_id:', err);
    res.status(500).json({ 
      error: 'Lỗi server khi lấy đánh giá theo sản phẩm',
      details: err.message 
    });
  }
});

// Helper function để cập nhật rating trung bình cho sản phẩm
async function updateProductAverageRating(productId) {
  try {
    const reviews = await ProductReview.find({ product_id: productId });
    const reviewCount = reviews.length;
    const avgRating = reviewCount > 0 
      ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount
      : 0;

    await Product.findByIdAndUpdate(productId, {
      rating: avgRating,
      reviewCount
    });
  } catch (error) {
    console.error('Error updating product average rating:', error);
  }
}

module.exports = router;