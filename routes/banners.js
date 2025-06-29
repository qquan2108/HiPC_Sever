const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const ctrl    = require('../controllers/bannerCtrl');

// Chắc chắn thư mục đã tồn tại (nếu chưa có sẽ tạo)
const uploadDir = path.join(__dirname, '../uploads/banners');
fs.mkdirSync(uploadDir, { recursive: true });

// Cấu hình Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const uniq = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniq + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// CRUD banner
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.delete('/:id', ctrl.delete);

// ★ Upload endpoint ★
router.post('/upload',
  upload.single('image'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Không có file gửi lên' });
    }
    console.log('File đã upload:', req.file.path);
    const url = `/uploads/banners/${req.file.filename}`;
    res.json({ url });
  }
);

module.exports = router;
