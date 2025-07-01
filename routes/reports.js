const express    = require('express');
const router     = express.Router();
const reportCtrl = require('../controllers/reportCtrl');

router.get('/summary', reportCtrl.getSummary);
router.get('/monthly', reportCtrl.getMonthlyRevenue);
router.get('/compare', reportCtrl.compareMonths);
router.get('/revenue', reportCtrl.getRevenue);

module.exports = router;
