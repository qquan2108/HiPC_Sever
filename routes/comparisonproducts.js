const express = require('express');
const router = express.Router();
const ComparisonProduct = require('../models/ComparisonProduct');

// GET all
router.get('/', async (req, res) => {
  try {
    const items = await ComparisonProduct.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET by id
router.get('/:id', async (req, res) => {
  try {
    const item = await ComparisonProduct.findById(req.params.id);
    res.json(item);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const newItem = new ComparisonProduct(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await ComparisonProduct.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await ComparisonProduct.findByIdAndDelete(req.params.id);
    res.json({ message: 'ComparisonProduct deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;