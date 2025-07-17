const mongoose = require('mongoose'); 
const Video = require('../models/Video');
const path = require('path');
const fs = require('fs');

// Hàm lấy tất cả video
exports.getAllVideos = async (req, res) => {
  try {
    const { search, hasCombo, sort } = req.query;
    
    let query = {};
    
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    
    if (hasCombo === 'true') {
      query.comboIds = { $exists: true, $ne: null };
    } else if (hasCombo === 'false') {
      query.comboIds = { $exists: false };
    }
    
    let sortOption = '-createdAt';
    if (sort === 'createdAt') sortOption = 'createdAt';
    if (sort === 'title') sortOption = 'title';
    
    const videos = await Video.find(query)
      .sort(sortOption)
      .populate({
        path: 'comboIds',
        populate: {
          path: 'productIds',
          model: 'Product'
        }
      });

    res.json(videos);
  } catch (err) {
    console.error('Error in getAllVideos:', err);
    res.status(500).json({ message: err.message });
  }
};

// Hàm upload video
// Sửa hàm uploadVideo
exports.uploadVideo = async (req, res) => {
  try {
    const { title, comboId } = req.body; // Giữ nguyên comboId từ frontend
    
    console.log('Upload video request:', { title, comboId, file: req.file });
    
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file video' });
    }

    if (!title || title.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề video' });
    }

    const videoUrl = `/uploads/videos/${req.file.filename}`;
    
    // Xử lý comboId
    let comboIds = [];
    if (comboId && comboId !== '' && mongoose.Types.ObjectId.isValid(comboId)) {
      comboIds = [comboId]; // Chuyển thành mảng
    }
    
    const video = new Video({
      title: title.trim(),
      videoUrl,
      comboIds, // Sử dụng mảng đã xử lý
      createdAt: new Date()
    });

    await video.save();
    
    const populatedVideo = await Video.findById(video._id)
      .populate({
        path: 'comboIds',
        populate: {
          path: 'productIds',
          model: 'Product'
        }
      });

    console.log('Video uploaded successfully:', populatedVideo);
    res.status(201).json(populatedVideo);
  } catch (err) {
    console.error('Error uploading video:', err);
    res.status(500).json({ message: err.message });
  }
};

// Hàm xóa video
exports.deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Tìm video để lấy thông tin file
    const video = await Video.findById(id);
    if (!video) {
      return res.status(404).json({ message: 'Video không tồn tại' });
    }

    // Xóa file video khỏi hệ thống
    if (video.videoUrl) {
      const filePath = path.join(__dirname, '..', 'uploads', 'videos', path.basename(video.videoUrl));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Xóa video khỏi database
    await Video.findByIdAndDelete(id);
    
    res.json({ message: 'Video đã được xóa thành công' });
  } catch (err) {
    console.error('Error deleting video:', err);
    res.status(500).json({ message: err.message });
  }
};

// Hàm render trang upload video
exports.renderUploadPage = (req, res) => {
  res.render('admin/video-form', { 
    title: 'Tải Video Mới',
    layout: false 
  });
};

// Hàm render trang quản lý video
exports.renderVideosPage = async (req, res) => {
  try {
    const videos = await Video.find()
      .sort('-createdAt')
      .populate({
        path: 'comboIds',
        populate: {
          path: 'productIds',
          model: 'Product'
        }
      });
    
    res.render('admin/videos', { 
      videos,
      title: 'Quản lý Video',
      layout: false 
    });
  } catch (err) {
    console.error('Error rendering videos page:', err);
    res.status(500).json({ message: err.message });
  }
};