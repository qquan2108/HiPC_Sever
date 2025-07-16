const Video = require('../models/Video');

exports.uploadVideo = async (req, res) => {
  try {
    const { title, comboId } = req.body;
    const videoUrl = `/uploads/videos/${req.file.filename}`;
    
    const video = new Video({
      title,
      videoUrl,
      comboId,
      createdAt: new Date()
    });

    await video.save();
    res.status(201).json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllVideos = async (req, res) => {
  try {
    const videos = await Video.find()
      .populate({
        path: 'comboId',
        populate: {
          path: 'productIds',
          model: 'Product'
        }
      });

    res.json(videos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
