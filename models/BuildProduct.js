const mongoose = require('mongoose');
const { Schema } = mongoose;

const BuildProductSchema = new Schema(
  {
    build_id:   { type: Schema.Types.ObjectId, ref: 'Build', required: true, index: true },
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity:   { type: Number, default: 1, min: 1 },

    // Lưu biến thể đã chọn (nếu có) để hiển thị và tính giá nhanh
    variant: {
      _id:   { type: Schema.Types.ObjectId, ref: 'VariantProduct' },
      key:   String,   // ví dụ: 'Dung lượng', 'Màu'
      label: String,   // ví dụ: '16GB', 'Đen'
      price: Number,   // giá của biến thể (nếu có)
      stock: Number
    },
  },
  { timestamps: true }
);

BuildProductSchema.index({ build_id: 1, product_id: 1 });

module.exports = mongoose.model('BuildProduct', BuildProductSchema);
