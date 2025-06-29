const express    = require('express');
const router     = express.Router();
const reportCtrl = require('../controllers/reportCtrl');

router.get('/summary', reportCtrl.getSummary);
router.get('/monthly', reportCtrl.getMonthlyRevenue);

module.exports = router;
