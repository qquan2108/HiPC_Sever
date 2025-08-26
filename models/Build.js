const mongoose = require('mongoose');

const buildSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  name: { 
    type: String,
    required: true 
  },
  total_price: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'completed', 'archived'],
    default: 'draft'
  },
  products: [{
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    variant: {
      _id: mongoose.Schema.Types.ObjectId,
      key: String,
      label: String,
      price: Number,
      stock: Number
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

module.exports = mongoose.model('Build', buildSchema);