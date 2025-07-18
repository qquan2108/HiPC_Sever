const express = require('express');
const router = express.Router();
const Combo = require('../models/Combo');
const comboController = require('../controllers/comboController');

router.post('/', comboController.createCombo);
router.get('/', comboController.getAllCombos);



module.exports = router;
