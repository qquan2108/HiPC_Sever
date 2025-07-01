const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notificationCtrl');
const stream  = require('../utils/notificationStream');

router.post('/',     ctrl.create);
router.get('/',      ctrl.list);
router.patch('/:id/read', ctrl.markRead);
router.delete('/:id',     ctrl.remove);
router.get('/stream', (req, res) => stream.addClient(res));

module.exports = router;
