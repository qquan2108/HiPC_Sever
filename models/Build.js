const mongoose = require('mongoose');

const buildSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  total_price: Number,
  created_at: { type: Date, default: Date.now },
  status: String,
  updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Build', buildSchema);