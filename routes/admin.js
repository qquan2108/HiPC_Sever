// File: routes/admin.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand    = require('../models/Brand');
const TsktProduct = require('../models/TsktProduct');

// Dashboard
router.get('/', (req, res) => {
  res.render('admin/index', { layout: 'admin/layout' });
});

// Quản lý Người dùng (static + JS fetch)
router.get('/users', (req, res) => {
  res.render('admin/user', { layout: 'admin/layout' });
});

// Quản lý Sản phẩm
router.get('/products', async (req, res) => {
  const products = await Product.find()
    .populate('category_id','name')
    .populate('brand_id','name');
  res.render('admin/products-static', { layout: 'admin/layout', products });
});
router.get('/products/create', async (req, res) => {
  const [categories, brands] = await Promise.all([Category.find(), Brand.find()]);
  res.render('admin/form', { layout:'admin/layout', categories, brands, product:{} });
});
router.get('/products/:id/edit', async (req, res) => {
  const [product, categories, brands] = await Promise.all([
    Product.findById(req.params.id),
    Category.find(),
    Brand.find()
  ]);
  const tsktTemplates = await TsktProduct.find({ category_id: product.category_id });
  res.render('admin/form', { layout:'admin/layout', product, categories, brands, tsktTemplates });
});

// Quản lý Danh mục
router.get('/categories', (req, res) => {
  res.render('admin/categories', { layout: 'admin/layout' });
});
router.get('/categories/create', (req, res) => {
  res.render('admin/category-form', { layout: 'admin/layout', category: {} });
});
router.get('/categories/:id/edit', async (req, res) => {
  const category = await Category.findById(req.params.id);
  res.render('admin/category-form', { layout: 'admin/layout', category });
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

// ql don hang
router.get('/orders', (req, res) => {
  res.render('admin/order', { layout: 'admin/layout' });
});

module.exports = router;
