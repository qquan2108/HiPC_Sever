const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatSession' },
  sender: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  is_read: Boolean
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);