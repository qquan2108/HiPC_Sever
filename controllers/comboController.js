const Combo = require('../models/Combo');

exports.createCombo = async (req, res) => {
  try {
    const { name, productIds, price, image } = req.body;

    const combo = new Combo({
      name,
      productIds,
      price,
      image
    });

    await combo.save();
    res.status(201).json(combo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllCombos = async (req, res) => {
  try {
    const combos = await Combo.find().populate('productIds');
    res.json(combos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
