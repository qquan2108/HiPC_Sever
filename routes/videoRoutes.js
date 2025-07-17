const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const upload = require('../middlewares/uploadVideo');

// API routes
router.post('/upload', upload.single('video'), videoController.uploadVideo);
router.get('/api', videoController.getAllVideos);
router.delete('/:id', videoController.deleteVideo);

// Admin page routes
router.get('/', videoController.renderVideosPage);
router.get('/upload', videoController.renderUploadPage);

module.exports = router;