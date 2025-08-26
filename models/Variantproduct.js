const mongoose = require('mongoose');

const VariantproductSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },

  // Giữ nguyên để hiển thị (back-compat)
  name:   { type: String, required: true, trim: true },

  // —— GỢI Ý THÊM CÁC TRƯỜNG CÓ CẤU TRÚC ——
  // Nhóm thuộc tính (ví dụ: "Chipset", "Form Factor", "Dung lượng", "Wattage", "Phiên bản", "Bảo hành", ...)
  groupKey:   { type: String, trim: true, index: true },    // ví dụ: "Chipset"
  // Giá trị hiển thị (ví dụ: "B550", "ATX", "64GB", "850W", "Box", "3 năm")
  optionLabel:{ type: String, trim: true, index: true },    // ví dụ: "B550"
  // Dạng chuẩn hóa để sort/search dễ (không dấu, lowercase)
  optionSlug: { type: String, trim: true, index: true },    // ví dụ: "b550", "atx", "64gb"

  // Giá: nếu bạn đang dùng "giá biến thể = base + chênh lệch" thì nên tách:
  price:      { type: Number, required: true, min: 0 },     // giữ nguyên nếu đang dùng trực tiếp
  priceDiff:  { type: Number, default: 0, min: 0 },         // tùy chọn: phần chênh so với sản phẩm base

  stock:      { type: Number, default: 0, min: 0 },

  // Trạng thái hiển thị (ẩn các biến thể test)
  isActive:   { type: Boolean, default: true },

  // Thứ tự hiển thị trong nhóm (để ưu tiên ATX > Micro-ATX > Mini-ITX, 16GB < 32GB < 64GB, …)
  sortOrder:  { type: Number, default: 0 },

  // (tùy chọn) Mã SKU/Barcode ảnh riêng của variant
  sku:        { type: String, trim: true, index: true },
  image:      { type: String, trim: true },
}, { timestamps: true });

// —— Index khuyến nghị ——
// Tìm nhanh theo nhóm + option
VariantproductSchema.index({ groupKey: 1, optionSlug: 1 });
// Gom nhanh sản phẩm theo nhóm/option
VariantproductSchema.index({ product_id: 1, groupKey: 1, optionSlug: 1 }, { unique: false });

module.exports = mongoose.model('VariantProduct', VariantproductSchema);
