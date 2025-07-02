// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  full_name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true
  },
  password: {
    type: String,
    required: function () {
      return !this.firebaseUid;
    }
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  // Avatar and banner URLs for user profile
  avatarUrl: {
    type: String,
    trim: true
  },
  bannerUrl: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['customer', 'admin', 'staff'],
    default: 'customer'
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  addresses: [
    {
      _id: false,
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      label: String, // Ví dụ: "Nhà riêng", "Công ty"
      address: String,
      latitude: Number,
      longitude: Number,
      provinceId: String,
      districtId: String,
      wardCode: String,
      isDefault: { type: Boolean, default: false }
    }
  ]
});

// Middleware to automatically update updated_at on save
userSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

// Middleware to update updated_at on findOneAndUpdate
userSchema.pre('findOneAndUpdate', function (next) {
  this._update.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);
