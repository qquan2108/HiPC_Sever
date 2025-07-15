const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notificationCtrl');
const stream  = require('../utils/notificationStream');

// Route chính xác:
router.post('/',     ctrl.create);
router.get('/',      ctrl.list);
router.get('/unread', ctrl.getUnread);
router.patch('/:id/read', ctrl.markRead);
router.delete('/:id',     ctrl.remove);
router.get('/stream', (req, res) => stream.addClient(res));
router.patch('/:id/read', ctrl.markRead);
router.patch('/mark-all-read', ctrl.markAllRead);

module.exports = router;
