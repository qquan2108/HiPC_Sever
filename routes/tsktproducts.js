const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/tsktCtrl');

router.post('/', ctrl.createTskt);
router.post('/bulk', ctrl.createTsktBulk);
router.get('/category/:category_id', ctrl.getByCategory);
router.delete('/:id', ctrl.deleteTskt);

module.exports = router;
