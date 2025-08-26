const mongoose = require('mongoose');
const { Schema } = mongoose;

const BuildSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: '' },
    total_price: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'in-progress', 'completed', 'archived'],
      default: 'draft',
    },
    // KHÔNG lưu mảng products trực tiếp ở đây để tránh trùng data với BuildProduct
  },
  {
    timestamps: true,                   // => createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual các dòng sản phẩm thuộc build (được populate khi query)
BuildSchema.virtual('products', {
  ref: 'BuildProduct',
  localField: '_id',
  foreignField: 'build_id',
  justOne: false,
});

BuildSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('Build', BuildSchema);
