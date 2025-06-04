const express = require('express');
const router = express.Router();
const BuildProduct = require('../models/BuildProduct');

// GET all
router.get('/', async (req, res) => {
  try {
    const items = await BuildProduct.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET by id
router.get('/:id', async (req, res) => {
  try {
    const item = await BuildProduct.findById(req.params.id);
    res.json(item);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const newItem = new BuildProduct(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await BuildProduct.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await BuildProduct.findByIdAndDelete(req.params.id);
    res.json({ message: 'BuildProduct deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;