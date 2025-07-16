const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const upload = require('../middlewares/uploadVideo');

router.post('/upload', upload.single('video'), videoController.uploadVideo);
router.get('/', videoController.getAllVideos);

module.exports = router;
