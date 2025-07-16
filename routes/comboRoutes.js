const express = require('express');
const router = express.Router();
const comboController = require('../controllers/comboController');

router.post('/', comboController.createCombo);
router.get('/', comboController.getAllCombos);

router.post('/', async (req, res) => {
  try {
    const { name, price, image, productIds } = req.body;

    const combo = new Combo({
      name,
      price,
      image,
      productIds: Array.isArray(productIds) ? productIds : [productIds]
    });

    await combo.save();
    res.redirect('/admin/combos/create'); // redirect lại trang tạo sau khi tạo xong
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
