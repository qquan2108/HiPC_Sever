const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Image = require('../models/Image');

// Ensure uploads directory exists for image manager
const uploadDir = path.join(__dirname, '../uploads/images');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniq = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniq + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// GET all images (optionally filtered by product or category)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.product_id) filter.product_id = req.query.product_id;
    if (req.query.category_id) filter.category_id = req.query.category_id;
    const items = await Image.find(filter).populate('product_id').populate('category_id');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload image file
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const url = `/uploads/images/${req.file.filename}`;
  res.json({ url });
});

// GET image by id
router.get('/:id', async (req, res) => {
  try {
    const item = await Image.findById(req.params.id).populate('product_id').populate('category_id');
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// POST create image
router.post('/', async (req, res) => {
  try {
    const newItem = new Image(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update image
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await Image.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE image
router.delete('/:id', async (req, res) => {
  try {
    await Image.findByIdAndDelete(req.params.id);
    res.json({ message: 'Image deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
