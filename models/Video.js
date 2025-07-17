const mongoose = require('mongoose');
const { Schema } = mongoose;

const videoSchema = new Schema({
  title: { type: String, required: true },
  videoUrl: { type: String, required: true },
  thumbnailUrl: { type: String },
  comboIds: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'Combo',
    default: [] // Thêm default để tránh null
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Video', videoSchema);
