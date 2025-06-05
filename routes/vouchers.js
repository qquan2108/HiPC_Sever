const express = require('express');
const router = express.Router();
const Voucher = require('../models/Voucher');

// GET all vouchers
router.get('/', async (req, res) => {
  try {
    const vouchers = await Voucher.find();
    res.json(vouchers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET voucher by code
router.get('/code/:code', async (req, res) => {
  try {
    const voucher = await Voucher.findOne({ code: req.params.code });
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
    res.json(voucher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create voucher
router.post('/', async (req, res) => {
  try {
    const newVoucher = new Voucher(req.body);
    await newVoucher.save();
    res.status(201).json(newVoucher);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update voucher
router.put('/:id', async (req, res) => {
  try {
    const updated = await Voucher.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE voucher
router.delete('/:id', async (req, res) => {
  try {
    await Voucher.findByIdAndDelete(req.params.id);
    res.json({ message: 'Voucher deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;