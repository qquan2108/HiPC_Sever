const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Tạo thư mục uploads/videos nếu chưa tồn tại
const uploadDir = path.join(__dirname, '..', 'uploads', 'videos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Tạo tên file unique với timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `video-${uniqueSuffix}${path.extname(file.originalname)}`;
    cb(null, filename);
  }
});

// Kiểm tra file type và size
const fileFilter = (req, file, cb) => {
  // Chỉ cho phép video files
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép tải lên file video!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

module.exports = upload;