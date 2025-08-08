// models/Cart.js - Updated to support both products and combos
const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
  user_id: {
    type: String, // Keep as String for compatibility
    required: true,
    index: true
  },
  products: [{
    // Single product
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: false
    },
    // Combo
    comboId: {
      type: Schema.Types.ObjectId,
      ref: 'Combo',
      required: false
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    price: {
      type: Number,
      required: false // Will be calculated from product/combo price
    },
    // Variant only applies to single products
    variant: {
      key: {
        type: String,
        required: function() {
          return this.productId && !this.comboId;
        }
      },
      label: {
        type: String,
        required: function() {
          return this.productId && !this.comboId;
        }
      },
      priceDiff: {
        type: Number,
        required: function() {
          return this.productId && !this.comboId;
        },
        default: 0
      }
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

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