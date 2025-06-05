const express = require('express');
const router = express.Router();
const Brand = require('../models/Brand');

// GET all brands
router.get('/', async (req, res) => {
  try {
    const brands = await Brand.find();
    res.json(brands);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

module.exports = router;