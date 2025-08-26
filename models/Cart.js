// models/Cart.js - Updated to support both products and combos
const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    comboId: { type: mongoose.Schema.Types.ObjectId, ref: 'Combo' },
    comboSelections: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Variantproduct', required: true },
    label: String,
    priceDiff: { type: Number, default: 0 }
  }],
    quantity: { type: Number, required: true, min: 1 },
    // Cho sản phẩm đơn lẻ
    variant: {
      _id: mongoose.Schema.Types.ObjectId,
      key: String,
      label: String,
      price: Number,
      stock: Number
    },
    // Cho combo
    type: { type: String, enum: ['product', 'combo'] },
    price: Number,
    comboDetails: {
      name: String,
      products: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        image: String,
        variant: {
          _id: mongoose.Schema.Types.ObjectId,
          name: String,
          price: Number,
          stock: Number
        }
      }]
    }
  }]
}, { timestamps: true });

// Pre-save middleware
cartSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Validate that each product has either productId or comboId, but not both
  for (let product of this.products) {
    if (!product.productId && !product.comboId) {
      return next(new Error('Mỗi item phải có productId hoặc comboId'));
    }
    if (product.productId && product.comboId) {
      return next(new Error('Item không thể vừa có productId vừa có comboId'));
    }
  }
  
  next();
});

// Indexes for performance
cartSchema.index({ user_id: 1 });
cartSchema.index({ 'products.productId': 1 });
cartSchema.index({ 'products.comboId': 1 });

// Virtual to calculate total price
cartSchema.virtual('totalPrice').get(function() {
  return this.products.reduce((total, product) => {
    const price = product.price || 0;
    return total + (price * product.quantity);
  }, 0);
});

// Method to get cart summary
cartSchema.methods.getSummary = function() {
  const productCount = this.products.filter(p => p.productId).length;
  const comboCount = this.products.filter(p => p.comboId).length;
  const totalItems = this.products.reduce((sum, p) => sum + p.quantity, 0);
  
  return {
    productCount,
    comboCount,
    totalItems,
    totalPrice: this.totalPrice
  };
};

module.exports = mongoose.model('Cart', cartSchema);