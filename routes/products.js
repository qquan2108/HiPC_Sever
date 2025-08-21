const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const productCtrl = require('../controllers/productCtrl');
const Order = require('../models/Order'); // Đường dẫn tới model Order
const Product = require('../models/Product'); // Đường dẫn tới model Product

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
router.get('/',    productCtrl.getProducts);

// Filter route - MUST come before /:id route
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

// Lấy 5 sản phẩm được khách hàng mua gần nhất
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
    const orderedProducts = uniqueProductIds.map(id => products.find(p => p._id.toString() === id)).filter(Boolean);

    res.json(orderedProducts);
  } catch (err) {
    console.error('Error in recently-bought:', err);
    res.status(500).json({ error: err.message });
  }
});

// Parameterized route - MUST come after all specific routes
router.get('/:id', productCtrl.getProductById);
router.post('/',   productCtrl.createProduct);
router.put('/:id', productCtrl.updateProduct);
router.delete('/:id', productCtrl.deleteProduct);
router.get('/best-sellers', productCtrl.getBestSellers);
// Route to retrieve all products without pagination
router.get('/all', productCtrl.getAllProducts);

module.exports = router;