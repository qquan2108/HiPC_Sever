const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
require('dotenv').config();

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = file.fieldname + '-' + Date.now();
    cb(null, name + ext);
  }
});
const upload = multer({ storage });

// POST /upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Không có file được gửi lên' });
  }
  // URL public (giả sử server host tại http://localhost:5000)
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

    // Generate JWT
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
        role: user.role
      }
    });

  } catch (err) {
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
router.put('/:id', async (req, res) => {
  try {
    const { full_name, phone, address, avatarUrl, bannerUrl } = req.body;
    const updates = { full_name, phone, address };

    // Chỉ thêm avatarUrl/bannerUrl nếu client gửi
    if (avatarUrl) updates.avatarUrl = avatarUrl;
    if (bannerUrl) updates.bannerUrl = bannerUrl;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User không tồn tại' });
    }

    res.status(200).json(updatedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
