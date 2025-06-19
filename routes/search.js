// File: routes/search.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// GET /search/products
// Query params:
//   q: string (search keyword)
//   filters: array of filter keys (price_low, price_mid, brand_x, …)
//   page: number (1-based)
//   type: 'autocomplete' | 'search'
router.get('/products', async (req, res) => {
  try {
    const {
      q = '',
      filters: rawFilters = [],
      page = 1,
      type = 'search'
    } = req.query;

    // Chuyển filters từ string hoặc array thành array thực sự
    const filters = Array.isArray(rawFilters)
      ? rawFilters
      : rawFilters.split(',').filter(f => f);

    // Nếu là autocomplete, chỉ trả về suggestions đơn giản
    if (type === 'autocomplete') {
      // Lấy tối đa 10 tên sản phẩm bắt đầu với q (case-insensitive)
      const suggestions = await Product
        .find({ name: new RegExp(`^${q}`, 'i') })
        .limit(10)
        .distinct('name');
      return res.json({ suggestions });
    }

    // Map filter keys thành điều kiện Mongo
    const filterQuery = {};
    filters.forEach(f => {
      switch (f) {
        case 'price_low':
          filterQuery.price = { ...(filterQuery.price||{}), $lt: 500000 };
          break;
        case 'price_mid':
          filterQuery.price = { ...(filterQuery.price||{}), $gte: 500000, $lte: 1000000 };
          break;
        case 'brand_x':
          filterQuery.brand_id = 'BRAND_X_ID'; // thay bằng ObjectId thực
          break;
        case 'brand_y':
          filterQuery.brand_id = 'BRAND_Y_ID';
          break;
        // ... mở rộng theo key của bạn
      }
    });

    // Build search query: nếu q có text thì dùng text-search, ngược lại trả hết
    const textQuery = q.trim()
      ? { $text: { $search: q.trim() } }
      : {};

    const pageNum = Math.max(parseInt(page, 10), 1);
    const limit = 20;
    const skip = (pageNum - 1) * limit;

    // Kết hợp textQuery + filterQuery
    const finalQuery = { ...textQuery, ...filterQuery };

    // Thực hiện tìm + pagination + projection nhẹ
    const [items, total] = await Promise.all([
      Product.find(finalQuery)
        .skip(skip)
        .limit(limit)
        .select('name price image')
        .lean(),
      Product.countDocuments(finalQuery)
    ]);

    return res.json({
      items,
      page: pageNum,
      totalPages: Math.ceil(total / limit),
      totalItems: total
    });
  } catch (err) {
    console.error('Error in /search/products:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
