const mongoose = require('mongoose');
const { Schema } = mongoose;

const videoSchema = new Schema({
  title:         { type: String, required: true },
  videoUrl:      { type: String, required: true }, // URL file video
  thumbnailUrl:  { type: String },
  comboIds:      { type: Schema.Types.ObjectId, ref: 'Combo' }, // Gắn 1 combo (hoặc mảng nếu nhiều)
  createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.model('Video', videoSchema);
