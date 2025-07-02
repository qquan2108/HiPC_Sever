const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const Banner = require('../models/Banner');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Đảm bảo thư mục uploads tồn tại
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// Serve static files for uploads
router.use('/uploads', express.static(UPLOAD_DIR));

// POST /upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Không có file được gửi lên' });
  }
  // URL public (giả sử server host tại http://localhost:3000)
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.status(200).json({ url });
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, phone, address } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: 'Email already in use' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = new User({
      full_name,
      email,
      password: hashedPassword,
      phone,
      address
    });

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Invalid role' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const banner = await Banner.findOne({ isActive: true })
      .sort('-createdAt')
      .lean();

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      },
      banner
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Google login
router.post('/google-login', async (req, res) => {
  try {
    const { firebaseUid, full_name, email, avatarUrl } = req.body;

    if (!firebaseUid || !email) {
      return res.status(400).json({ message: 'Missing firebaseUid or email' });
    }

    let user = await User.findOne({ firebaseUid });

    if (!user) {
      user = await User.findOne({ email });
    }

    if (!user) {
      user = new User({ firebaseUid, full_name, email, avatarUrl });
    } else {
      if (!user.firebaseUid) user.firebaseUid = firebaseUid;
      if (full_name && !user.full_name) user.full_name = full_name;
      if (avatarUrl) user.avatarUrl = avatarUrl;
    }

    await user.save();

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all users
router.get('/all', async (req, res) => {
  try {
    const users = await User.find().select('-password'); // Ẩn trường password
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Hàm chuyển url ảnh thành tuyệt đối
function makeAbsoluteUrl(req, url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${req.protocol}://${req.get('host')}/${url.replace(/^\/+/, '')}`;
}

// PUT update user
router.put('/:id', async (req, res) => {
  try {
    const { full_name, phone, address, avatarUrl, bannerUrl, latitude, longitude } = req.body;
    const updates = { full_name, phone, address, latitude, longitude };

    // XỬ LÝ avatarUrl
    if (typeof avatarUrl === 'string') {
      if (avatarUrl.startsWith('data:')) {
        // KHÔNG lưu base64
        updates.avatarUrl = '';
      } else if (avatarUrl.startsWith('http')) {
        // Nếu là URL tuyệt đối, chuyển về đường dẫn tương đối
        const host = `${req.protocol}://${req.get('host')}/`;
        updates.avatarUrl = avatarUrl.replace(host, '');
      } else {
        // Đường dẫn tương đối
        updates.avatarUrl = avatarUrl;
      }
    }

    // XỬ LÝ bannerUrl
    if (typeof bannerUrl === 'string') {
      if (bannerUrl.startsWith('data:')) {
        // KHÔNG lưu base64
        updates.bannerUrl = '';
      } else if (bannerUrl.startsWith('http')) {
        const host = `${req.protocol}://${req.get('host')}/`;
        updates.bannerUrl = bannerUrl.replace(host, '');
      } else {
        updates.bannerUrl = bannerUrl;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User không tồn tại' });
    }

    // Trả về URL tuyệt đối cho client
    const userObj = updatedUser.toObject();
    userObj.avatarUrl = userObj.avatarUrl
      ? makeAbsoluteUrl(req, userObj.avatarUrl)
      : '';
    userObj.bannerUrl = userObj.bannerUrl
      ? makeAbsoluteUrl(req, userObj.bannerUrl)
      : '';

    res.status(200).json(userObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET user by id
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Xử lý url tuyệt đối
    const userObj = user.toObject();
    userObj.avatarUrl = userObj.avatarUrl
      ? makeAbsoluteUrl(req, userObj.avatarUrl)
      : '';
    userObj.bannerUrl = userObj.bannerUrl
      ? makeAbsoluteUrl(req, userObj.bannerUrl)
      : '';

    res.status(200).json(userObj);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Lấy danh sách địa chỉ giao hàng của user
router.get('/:id/addresses', async (req, res) => {
  const user = await User.findById(req.params.id).select('addresses address latitude longitude provinceId districtId wardCode');
  if (!user) return res.status(404).json({ message: 'User not found' });
  // Nếu chưa có địa chỉ giao hàng, lấy trường address làm mặc định
  if ((!user.addresses || user.addresses.length === 0) && user.address) {
    const defaultAddr = {
      id: "default",
      label: "Địa chỉ mặc định",
      address: user.address,
      latitude: user.latitude || null,
      longitude: user.longitude || null,
      provinceId: user.provinceId || null,
      districtId: user.districtId || null,
      wardCode: user.wardCode || null,
      isDefault: true
    };
    return res.json([defaultAddr]);
  }
  res.json(user.addresses || []);
});

// Thêm địa chỉ giao hàng
// Thêm địa chỉ giao hàng
router.post('/:id/addresses', async (req, res) => {
  const { label, address, latitude, longitude, provinceId, districtId, wardCode } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const newAddr = {
    id: new Date().getTime().toString(),
    label, address, latitude, longitude, provinceId, districtId, wardCode,
    isDefault: user.addresses.length === 0
  };
  user.addresses.push(newAddr);
  await user.save();
  res.json(user.addresses);
});

// Xóa địa chỉ giao hàng
router.delete('/:id/addresses/:addrId', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.addresses = user.addresses.filter(a => a.id !== req.params.addrId);
  await user.save();
  res.json(user.addresses);
});

// Đặt địa chỉ mặc định
router.put('/:id/addresses/:addrId/default', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.addresses.forEach(a => a.isDefault = a.id === req.params.addrId);
  await user.save();
  res.json(user.addresses);
});

router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)||1);
    const limit = Math.max(1, parseInt(req.query.limit)||20);
    const skip  = (page-1)*limit;
    const [ users, total ] = await Promise.all([
      User.find().skip(skip).limit(limit).lean(),
      User.countDocuments()
    ]);
    res.json({
      users: users.map(u => ({
        _id   : u._id,
        name  : u.full_name,
        email : u.email,
        role  : u.role,
        active: u.active,
        avatar: u.avatarUrl
      })),
      hasMore: skip + users.length < total
    });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: 'Xóa lỗi' });
  }
});
  
module.exports = router;
