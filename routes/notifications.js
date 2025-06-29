const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notificationCtrl');

router.post('/',     ctrl.create);
router.get('/',      ctrl.list);
router.patch('/:id/read', ctrl.markRead);
router.delete('/:id',     ctrl.remove);

module.exports = router;
