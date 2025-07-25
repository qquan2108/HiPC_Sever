const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Combo = require('../models/Combo');
const Image = require('../models/Image');
const mongoose = require('mongoose');

// GET cart by user ID - FIXED VERSION
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID format',
        products: [] 
      });
    }

    console.log('Getting cart for userId:', userId);

    // 1) Lấy duy nhất 1 cart của user
    const cart = await Cart
      .findOne({ user_id: userId })
      .populate('products.productId');

    console.log('Found cart:', cart ? 'Yes' : 'No');

    // 2) Nếu chưa có cart thì trả về mảng rỗng
    if (!cart) {
      console.log('No cart found, returning empty array');
      return res.status(200).json({ products: [] });
    }

    console.log('Cart products count:', cart.products.length);

    // 3) Gắn URL ảnh nếu bạn lưu trong collection Image
    for (const item of cart.products) {
      if (item.productId?._id) {
        try {
          const imgDoc = await Image.findOne({ product_id: item.productId._id });
          item.productId.image = imgDoc?.url || null;
        } catch (imgErr) {
          console.log('Error fetching image for product:', item.productId._id, imgErr.message);
          item.productId.image = null;
        }
      }
    }

    // 4) Trả về đúng format
    console.log('Returning cart with', cart.products.length, 'products');
    res.status(200).json({ products: cart.products });

  } catch (err) {
    console.error('Error in GET /cartt/user/:userId:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      message: err.message,
      products: [] 
    });
  }
});

router.post('/add-combo', async (req, res) => {
  try {
    const { user_id, comboId, quantity = 1 } = req.body;
    
    console.log('🔍 Adding combo to cart:', { user_id, comboId, quantity });

    // Validate required fields
    if (!user_id || !comboId) {
      return res.status(400).json({ 
        error: 'Thiếu thông tin bắt buộc (user_id, comboId).' 
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(user_id) || !mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ error: 'Invalid ID format.' });
    }

    // Check if combo exists
    const combo = await Combo.findById(comboId).populate('productIds');
    if (!combo) {
      return res.status(404).json({ error: 'Combo không tồn tại.' });
    }

    console.log('📦 Combo found:', combo.name);

    // Find or create cart
    let cart = await Cart.findOne({ user_id });
    if (!cart) {
      cart = new Cart({ user_id, products: [] });
      console.log('🆕 Created new cart');
    }

    // Check if combo already exists in cart
    const existingCombo = cart.products.find(p => 
      p.comboId && p.comboId.toString() === comboId
    );

    if (existingCombo) {
      // If combo exists, increase quantity
      existingCombo.quantity += quantity;
      console.log('➕ Increased combo quantity to:', existingCombo.quantity);
    } else {
      // If combo doesn't exist, add new
      cart.products.push({
        comboId,
        quantity,
        price: combo.price
      });
      console.log('🆕 Added new combo to cart');
    }

    await cart.save();

    // Return populated cart
    const populatedCart = await Cart.findById(cart._id)
      .populate('products.productId')
      .populate({
        path: 'products.comboId',
        populate: {
          path: 'productIds',
          model: 'Product'
        }
      });

    console.log('✅ Combo added successfully');
    res.status(200).json({
      message: 'Combo đã được thêm vào giỏ hàng',
      cart: populatedCart
    });

  } catch (err) {
    console.error('❌ Error in add-combo:', err);
    res.status(500).json({ 
      error: 'Có lỗi server, vui lòng thử lại.',
      message: err.message 
    });
  }
});

// Add product to cart (creates cart if not exist)
router.post('/add-to-cart', async (req, res) => {
  try {
    const { user_id, productId, quantity, variant } = req.body;
    
    // Validate required fields
    if (!user_id || !productId || !quantity) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (user_id, productId, quantity).' });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(user_id) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid ID format.' });
    }

    // Validate variant if provided
    if (variant && (!variant.key || !variant.label)) {
      return res.status(400).json({ error: 'Variant phải có key và label.' });
    }

    let cart = await Cart.findOne({ user_id });
    if (!cart) {
      cart = new Cart({ user_id, products: [] });
    }

    // Find existing product with same variant
    const existing = cart.products.find(p => {
      if (!p.productId) return false; // <--- Fix: tránh lỗi nếu productId undefined
      const sameProduct = p.productId.toString() === productId;
      if (!variant) return sameProduct;
      return sameProduct && 
             p.variant?.key === variant.key && 
             p.variant?.label === variant.label;
    });

    if (existing) {
      existing.quantity += quantity;
    } else {
      const newProduct = {
        productId,
        quantity,
      };
      
      if (variant) {
        newProduct.variant = {
          key: variant.key,
          label: variant.label,
          priceDiff: variant.priceDiff || 0
        };
      }
      
      cart.products.push(newProduct);
    }

    await cart.save();
    const populated = await Cart.findById(cart._id).populate('products.productId');
    res.status(200).json(populated);
  } catch (err) {
    console.error('Error in add-to-cart:', err);
    res.status(500).json({ error: 'Có lỗi server, vui lòng thử lại.' });
  }
});

// Update quantity


// 🆕 Update quantity cho combo
router.put('/update-quantity', async (req, res) => {
  try {
    const { user_id, productId, comboId, variant = {}, quantity } = req.body;
    
    // Validate inputs
    if (!user_id || (!productId && !comboId) || quantity === undefined) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    }

    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    if (quantity < 1) {
      return res.status(400).json({ error: 'Số lượng phải lớn hơn 0.' });
    }

    const cart = await Cart.findOne({ user_id });
    if (!cart) {
      return res.status(404).json({ error: 'Giỏ hàng không tồn tại.' });
    }

    let item;
    
    if (comboId) {
      // Update combo quantity
      if (!mongoose.Types.ObjectId.isValid(comboId)) {
        return res.status(400).json({ error: 'Invalid combo ID format.' });
      }
      
      item = cart.products.find(p => p.comboId && p.comboId.toString() === comboId);
    } else {
      // Update product quantity
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ error: 'Invalid product ID format.' });
      }
      
      item = cart.products.find(p => {
        if (p.productId.toString() !== productId) return false;
        if (variant.key) {
          return p.variant?.key === variant.key && p.variant?.label === variant.label;
        }
        return true;
      });
    }

    if (!item) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm trong giỏ hàng.' });
    }

    item.quantity = quantity;
    await cart.save();
    
    const populated = await Cart.findById(cart._id)
      .populate('products.productId')
      .populate({
        path: 'products.comboId',
        populate: {
          path: 'productIds',
          model: 'Product'
        }
      });
    
    res.status(200).json(populated);
  } catch (err) {
    console.error('Error in update-quantity:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🆕 Remove combo from cart
router.delete('/remove-combo', async (req, res) => {
  try {
    const { user_id, comboId } = req.body;
    
    // Validate inputs
    if (!user_id || !comboId) {
      return res.status(400).json({ error: 'Thiếu user_id hoặc comboId.' });
    }

    if (!mongoose.Types.ObjectId.isValid(user_id) || !mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ error: 'Invalid ID format.' });
    }

    const updated = await Cart.findOneAndUpdate(
      { user_id },
      { $pull: { products: { comboId } } },
      { new: true }
    ).populate('products.productId')
     .populate({
       path: 'products.comboId',
       populate: {
         path: 'productIds',
         model: 'Product'
       }
     });

    if (!updated) {
      return res.status(404).json({ error: 'Giỏ hàng không tồn tại.' });
    }
    
    res.status(200).json(updated);
  } catch (err) {
    console.error('Error in remove-combo:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🆕 Get combo details (for cart display)
router.get('/combo/:comboId', async (req, res) => {
  try {
    const { comboId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ error: 'Invalid combo ID format.' });
    }

    const combo = await Combo.findById(comboId).populate('productIds');
    
    if (!combo) {
      return res.status(404).json({ error: 'Combo không tồn tại.' });
    }

    res.status(200).json(combo);
  } catch (err) {
    console.error('Error in get combo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove product from cart
router.delete('/remove-product', async (req, res) => {
  try {
    const { user_id, productId, variant = {} } = req.body;
    
    // Validate inputs
    if (!user_id || !productId) {
      return res.status(400).json({ error: 'Thiếu user_id hoặc productId.' });
    }

    if (!mongoose.Types.ObjectId.isValid(user_id) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid ID format.' });
    }

    const pullFilter = { productId };
    if (variant.key && variant.label) {
      pullFilter['variant.key'] = variant.key;
      pullFilter['variant.label'] = variant.label;
    }

    const updated = await Cart.findOneAndUpdate(
      { user_id },
      { $pull: { products: pullFilter } },
      { new: true }
    ).populate('products.productId');

    if (!updated) {
      return res.status(404).json({ error: 'Giỏ hàng không tồn tại.' });
    }
    
    res.status(200).json(updated);
  } catch (err) {
    console.error('Error in remove-product:', err);
    res.status(500).json({ error: err.message });
  }
});

// Checkout: convert cart to order and clear cart
router.post('/checkout', async (req, res) => {
  try {
    const { user_id, address, paymentMethod, shippingMethod, voucher } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    const cart = await Cart.findOne({ user_id }).populate('products.productId');
    if (!cart || !cart.products.length) {
      return res.status(400).json({ error: 'Giỏ hàng trống' });
    }

    let totalPrice = 0;
    for (const item of cart.products) {
      const prod = item.productId;
      if (!prod) {
        return res.status(400).json({ error: 'Sản phẩm không tồn tại trong hệ thống' });
      }
      
      const itemPrice = prod.price + (item.variant?.priceDiff || 0);
      if (prod.stock < item.quantity) {
        return res.status(400).json({ error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock}` });
      }
      totalPrice += itemPrice * item.quantity;
      
      await Product.updateOne(
        { _id: prod._id },
        { $inc: { stock: -item.quantity } }
      );
    }

    const order = new Order({
      user_id,
      products: cart.products.map(p => ({
        productId: p.productId._id || p.productId,
        quantity: p.quantity,
        variant: p.variant || {}
      })),
      address,
      paymentMethod,
      shippingMethod,
      voucher,
      total_price: totalPrice,
      total: totalPrice,
      status: 'pending'
    });
    await order.save();

    // Clear cart
    cart.products = [];
    await cart.save();

    res.status(200).json({ 
      message: 'Đặt hàng thành công', 
      orderId: order._id,
      total: totalPrice 
    });
  } catch (err) {
    console.error('Error in checkout:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;