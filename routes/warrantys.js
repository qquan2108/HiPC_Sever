const express = require('express');
const router = express.Router();
const Warranty = require('../models/Warranty');

// GET all
router.get('/', async (req, res) => {
  try {
    const items = await Warranty.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET by id
router.get('/:id', async (req, res) => {
  try {
    const item = await Warranty.findById(req.params.id);
    res.json(item);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const newItem = new Warranty(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await Warranty.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await Warranty.findByIdAndDelete(req.params.id);
    res.json({ message: 'Warranty deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;