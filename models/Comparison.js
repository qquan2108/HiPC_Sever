const mongoose = require('mongoose');

const comparisonSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: String,
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Comparison', comparisonSchema);