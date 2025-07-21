const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const ctrl    = require('../controllers/productCtrl');

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
router.get('/',    ctrl.getProducts);

// Filter route - MUST come before /:id route
router.get('/filter', ctrl.filterProducts);

// Upload product image (needs to come before "/:id" route)
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const url = `/uploads/products/${req.file.filename}`;
  res.json({ url });
});

// Upload products via Excel file
router.post('/upload-excel', upload.single('file'), ctrl.uploadProductsFromExcel);

// Export products to Excel file
router.get('/export-excel', ctrl.exportProductsToExcel);

// Parameterized route - MUST come after all specific routes
router.get('/:id', ctrl.getProductById);
router.post('/',   ctrl.createProduct);
router.put('/:id', ctrl.updateProduct);
router.delete('/:id', ctrl.deleteProduct);
// Route to retrieve all products without pagination
router.get('/all', ctrl.getAllProducts);
module.exports = router;