const express = require('express');
const router = express.Router();
const TsktProduct = require('../models/TsktProduct');

// GET all
router.get('/', async (req, res) => {
  try {
    const items = await TsktProduct.find().populate('product_id').populate('category_id');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;