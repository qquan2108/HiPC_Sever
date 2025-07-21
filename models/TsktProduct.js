const mongoose = require('mongoose');

const variantOptionSchema = new mongoose.Schema({
  name:    { type: String, required: true },   // ví dụ: "Phiên bản", "Dung lượng", "Màu sắc"
  options: { type: [String], required: true }  // ví dụ: ["R5 5500","R5 4600G"], ["500GB","1TB","2TB"], ["Đen","Bạc"]
}, { _id: false });

const tsktSchema = new mongoose.Schema({
  category_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },

  // nếu bạn vẫn cần lưu các key của thông số (ví dụ: ["BusMHz","DungLuongGB"])
  specs:          { type: [String], required: true, default: [] },

  // mảng các variant attributes
  variantOptions: { type: [variantOptionSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('TsktProduct', tsktSchema);
