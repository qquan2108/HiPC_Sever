// File: routes/admin.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const TsktProduct = require('../models/TsktProduct');
const User = require('../models/userModel');
const Video = require('../models/Video');
const Combo = require('../models/Combo');
const Image = require('../models/Image');
const Order = require('../models/Order');

// Dashboard
router.get('/dashboard', async (req, res) => {
  const [productCount, orderCount] = await Promise.all([
    Product.countDocuments(),
    Order.countDocuments()
  ]);
  res.render('admin/index', {
    layout: 'admin/layout',
    productCount,
    orderCount
  });
});

// Quản lý Người dùng (static + JS fetch)
router.get('/users', (req, res) => {
  res.render('admin/user', { layout: 'admin/layout' });
});
router.get('/users/create', (req, res) => {
  res.render('admin/user-form', { layout: 'admin/layout', user: {} });
});
router.get('/users/:id/edit', async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  res.render('admin/user-form', { layout: 'admin/layout', user });
});

// Quản lý Sản phẩm
router.get('/products', async (req, res) => {
  const products = await Product.find()
    .populate('category_id', 'name')
    .populate('brand_id', 'name')
    .lean();
  res.render('admin/products-static', { layout: 'admin/layout', products });
});
router.get('/products/create', async (req, res) => {
  const [categories, brands] = await Promise.all([
    Category.find().lean(),
    Brand.find().lean()
  ]);
  res.render('admin/form', { layout: 'admin/layout', categories, brands, product: {} });
});
router.get('/products/:id/edit', async (req, res) => {
  const [product, categories, brands] = await Promise.all([
    Product.findById(req.params.id).lean(),
    Category.find().lean(),
    Brand.find().lean()
  ]);
  const tsktTemplates = await TsktProduct.find({ category_id: product.category_id }).lean();
  res.render('admin/form', { layout: 'admin/layout', product, categories, brands, tsktTemplates });
});

// Quản lý Danh mục
router.get('/categories', (req, res) => {
  res.render('admin/categories', { layout: 'admin/layout' });
});
// Trang tạo danh mục
router.get('/categories/create', (req, res) => {
  res.render('admin/category-form', { category: {} });
});

// Trang sửa danh mục
router.get('/categories/edit/:id', async (req, res) => {
  const [category, image] = await Promise.all([
    Category.findById(req.params.id).lean(),
    Image.findOne({ category_id: req.params.id }).lean()
  ]);
  const categoryData = category ? { ...category, image: image ? image.url : '' } : {};
  res.render('admin/category-form', { category: categoryData });
});

// bao cao
router.get('/reports', (req, res) => {
  res.render('admin/baocao', { layout: 'admin/layout' });
});
// thong bao
router.get('/notifications', (req, res) => {
  res.render('admin/thongbao', { layout: 'admin/layout' });
});

//ql banner
router.get('/banner', (req, res) => {
  res.render('admin/qlbanner', { layout: 'admin/layout' });
});

// FAQ page
router.get('/faq', (req, res) => {
  res.render('admin/faq', { layout: 'admin/layout' });
});

//order
const { transitions } = require('../utils/orderStatus');

// Trang list orders (đã có)
router.get('/orders', (req, res) => res.render('admin/order', { layout: 'admin/layout' }));

// Trang tạo mới
router.get('/orders/create', async (req, res) => {
  res.render('admin/order-form', { layout: 'admin/layout', order: {}, mode: 'create' });
});

// Trang chỉnh sửa
router.get('/orders/:id/edit', async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user_id', 'full_name email')
    .populate('products.productId', 'name price')
    .lean();
  if (req.query.ajax === '1') {
    // Render partial form không layout
    return res.render('admin/order-form', { order, mode: 'edit', transitions, layout: false });
  }
  res.render('admin/order-form', { layout: 'admin/layout', order, mode: 'edit', transitions });
});

router.get('/videos', async (req, res) => {
  const videos = await Video.find().populate({
    path: 'comboIds',
    populate: { path: 'productIds' }
  }).lean();

  res.render('admin/videos', { layout: 'admin/layout', videos });
});

// Trang upload video
router.get('/videos/create', async (req, res) => {
  const [combos, products] = await Promise.all([
    Combo.find().lean(),
    Product.find().populate('brand_id').lean()
  ]);

  res.render('admin/video-form', {
    layout: 'admin/layout',
    combos,
    products
  });
});

// API endpoints để lấy dữ liệu JSON
router.get('/api/combos', async (req, res) => {
  try {
    const combos = await Combo.find().populate('productIds');
    res.json(combos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().populate('brand_id').lean();
    const ids = products.map(p => p._id);
    const images = await Image.find({ product_id: { $in: ids } }).lean();
    const imageMap = {};
    images.forEach(img => {
      if (!imageMap[img.product_id]) imageMap[img.product_id] = img.url;
    });
    const productsWithImage = products.map(p => ({
      ...p,
      image: imageMap[p._id] || null
    }));
    res.json(productsWithImage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm route API mới trước module.exports
router.get('/api/videos', async (req, res) => {
    try {
        const { search, hasCombo, sort } = req.query;
        
        let query = {};
        
        if (search) {
            query.title = { $regex: search, $options: 'i' };
        }
        
        if (hasCombo === 'true') {
            query.comboIds = { $exists: true, $not: { $size: 0 } };
        } else if (hasCombo === 'false') {
            query.$or = [
                { comboIds: { $exists: false } },
                { comboIds: { $size: 0 } }
            ];
        }
        
        let sortOption = '-createdAt';
        if (sort === 'createdAt') sortOption = 'createdAt';
        if (sort === 'title') sortOption = 'title';
        
        const videos = await Video.find(query)
            .sort(sortOption)
            .populate({
                path: 'comboIds',
                populate: {
                    path: 'productIds',
                    model: 'Product'
                }
            });

        res.json(videos);
    } catch (err) {
        console.error('Error in /api/videos:', err);
        res.status(500).json({ message: err.message });
    }
});
router.delete('/videos/:id', async (req, res) => {
  try {
    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Video đã được xóa thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.post('/api/cart', async (req, res) => {
  try {
const { user_id, comboId } = req.body;

    if (!user_id || !comboId) {
      return res.status(400).json({ message: 'user_id and comboId are required' });
    }

    const combo = await Combo.findById(comboId).lean();
    if (!combo) return res.status(404).json({ message: 'Combo not found' });

    let order = await Order.findOne({ user_id, status: 'pending', address: { $in: [null, ''] } });
    if (!order) {
      order = new Order({ user_id, products: [], status: 'pending' });
    }

    for (const productId of combo.productIds) {
      const prod = order.products.find(p => p.productId.toString() === productId.toString());
      prod ? prod.quantity++ : order.products.push({ productId, quantity: 1 });
    }

    await order.save();
    const populated = await Order.findById(order._id).populate('products.productId');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get('/manage-builds', (req, res) => {
  res.render('admin/manage-builds', { layout: 'admin/layout' });
});
router.get('/preset-build', (req, res) => {
  res.render('admin/preset-build', { layout: 'admin/layout' });
});

// Quản lý voucher
router.get('/vouchers', (req, res) => {
  res.render('admin/vouchers', { layout: 'admin/layout' });
});

module.exports = router;