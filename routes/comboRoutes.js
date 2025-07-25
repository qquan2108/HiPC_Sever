const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Combo = require('../models/Combo');
const comboController = require('../controllers/comboController');

router.post('/', comboController.createCombo);
router.get('/', comboController.getAllCombos);

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid combo ID format.' });
    }

    const combo = await Combo.findById(id).populate('productIds');
    
    if (!combo) {
      return res.status(404).json({ error: 'Combo không tồn tại.' });
    }

    res.status(200).json(combo);
  } catch (err) {
    console.error('Error fetching combo:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
