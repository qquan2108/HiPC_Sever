const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  start_time: Date,
  end_time: Date,
  status: String,
  language: String
});

module.exports = mongoose.model('ChatSession', chatSessionSchema);