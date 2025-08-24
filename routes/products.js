const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const productCtrl = require('../controllers/productCtrl');
const Order = require('../models/Order');
const Product = require('../models/Product');
const VariantProduct = require('../models/Variantproduct'); // Đảm bảo đúng tên file/model

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/products');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniq = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniq + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// IMPORTANT: Specific routes must come BEFORE parameterized routes
router.get('/', productCtrl.getProducts);

// Filter routes - MUST come before /:id route
router.get('/filter', productCtrl.filterProducts); // filter nâng cao
router.get('/filter-keyword', productCtrl.filterProductsByKeyword); // filter đơn giản cho chatbox

// Upload product image (needs to come before "/:id" route)
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const url = `/uploads/products/${req.file.filename}`;
  res.json({ url });
});

// Upload products via Excel file
router.post('/upload-excel', upload.single('file'), productCtrl.uploadProductsFromExcel);

// Export products to Excel file
router.get('/export-excel', productCtrl.exportProductsToExcel);

// Get best sellers - MUST come before /:id route
router.get('/best-sellers', productCtrl.getBestSellers);

// Get all products without pagination - MUST come before /:id route
router.get('/all', productCtrl.getAllProducts);

// Lấy 5 sản phẩm được khách hàng mua gần nhất - MUST come before /:id route
router.get('/recently-bought', async (req, res) => {
  try {
    // Lấy 20 đơn hàng gần nhất (có thể điều chỉnh số lượng nếu muốn)
    const recentOrders = await Order.find({ status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Lấy danh sách sản phẩm từ các đơn hàng này
    const productIds = [];
    for (const order of recentOrders) {
      for (const item of order.products) {
        if (item.productId) {
          productIds.push(item.productId.toString());
        }
      }
    }

    // Giữ lại thứ tự xuất hiện gần nhất, loại trùng
    const uniqueProductIds = [...new Set(productIds)].slice(0, 5);

    // Lấy thông tin sản phẩm
    const products = await Product.find({ _id: { $in: uniqueProductIds } }).lean();

    // Đảm bảo trả về đúng thứ tự gần nhất
    const orderedProducts = uniqueProductIds
      .map(id => products.find(p => p._id.toString() === id))
      .filter(Boolean);

    res.json(orderedProducts);
  } catch (err) {
    console.error('Error in recently-bought:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ FIX: Route to retrieve products by category - MUST come before /:id route
router.get('/by-category/:categoryId', productCtrl.getProductsByCategory);

// ✅ IMPORTANT: Parameterized route - MUST come after all specific routes
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category_id')
      .populate('brand_id')
      .lean();

    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    // Lấy các variant từ bảng VariantProduct
    const variants = await VariantProduct.find({ product_id: product._id }).lean();

    // Format về dạng group cho UI
    product.variants = [
      {
        key: 'Phiên bản',
        options: variants.map(v => ({
          label: v.name,
          priceDiff: (v.price || 0) - (product.price || 0), // Chênh lệch giá so với gốc
          price: v.price,
          stock: v.stock,
          _id: v._id,
        }))
      }
    ];

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST, PUT, DELETE routes
router.post('/', productCtrl.createProduct);
router.put('/:id', productCtrl.updateProduct);
router.delete('/:id', productCtrl.deleteProduct);

module.exports = router;