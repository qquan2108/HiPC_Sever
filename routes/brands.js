const express = require('express');
const router = express.Router();
const Brand = require('../models/Brand');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Tạo thư mục lưu nếu chưa có
const uploadDir = path.join(__dirname, '../public/uploads/brands');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '_').replace(/[^\w.\-]/g, '');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Chỉ nhận file ảnh'));
    cb(null, true);
  }
});

// POST /brands/upload -> { url }
router.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file' });
  // URL public: nhớ serve static thư mục /public
  const url = `/uploads/brands/${file.filename}`;
  res.json({ url });
});

// GET all brands
router.get('/', async (req, res) => {
  try {
    const brands = await Brand.find();
    res.json(brands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET brand by ID
router.get('/:id', async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    res.json(brand);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST create brand
router.post('/', async (req, res) => {
  try {
    const newBrand = new Brand(req.body);
    await newBrand.save();
    res.status(201).json(newBrand);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update brand
router.put('/:id', async (req, res) => {
  try {
    const updatedBrand = await Brand.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedBrand) return res.status(404).json({ error: 'Brand not found' });
    res.json(updatedBrand);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE brand
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Brand.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Brand not found' });
    res.json({ message: 'Brand deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
