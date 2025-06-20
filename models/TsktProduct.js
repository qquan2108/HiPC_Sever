const mongoose = require('mongoose');

// Mỗi template có array các mục giá trị
const tsktSchema = new mongoose.Schema({
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  value:       { type: [String], required: true, default: [] } // mảng các trường thông số, ví dụ: ["BusMHz", "DungLuongGB"]
}, { timestamps: true });

module.exports = mongoose.model('TsktProduct', tsktSchema);
