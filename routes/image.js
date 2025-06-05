const express = require('express');
const router = express.Router();
const Image = require('../models/Image');

// GET all images
router.get('/', async (req, res) => {
  try {
    const items = await Image.find().populate('product_id').populate('category_id');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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