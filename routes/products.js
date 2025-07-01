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

router.get('/',    ctrl.getProducts);
// Upload product image (needs to come before "/:id" route)
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const url = `/uploads/products/${req.file.filename}`;
  res.json({ url });
});
router.get('/:id', ctrl.getProductById);
router.post('/',   ctrl.createProduct);
router.put('/:id', ctrl.updateProduct);
router.delete('/:id', ctrl.deleteProduct);

module.exports = router;