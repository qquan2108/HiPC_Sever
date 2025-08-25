const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Combo = require('../models/Combo');
const Image = require('../models/Image');
const VariantProduct = require('../models/Variantproduct');
const mongoose = require('mongoose');
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format', products: [] });
    }

    const cart = await Cart
      .findOne({ user_id: userId })
      .populate('products.productId');

    if (!cart) {
      return res.status(200).json({ products: [] });
    }

    for (const item of cart.products) {
      if (item.productId?._id) {
        try {
          const imgDoc = await Image.findOne({ product_id: item.productId._id });
          item.productId.image = imgDoc?.url || null;
        } catch (imgErr) {
          item.productId.image = null;
        }
        // Lấy tồn kho biến thể
        if (item.variant && item.variant.label) {
          try {
            const variantDoc = await VariantProduct.findOne({
              product_id: item.productId._id,
              name: item.variant.label
            }).lean();
            if (variantDoc) {
              item.variant = {
                ...item.variant,
                stock: variantDoc.stock,
                price: variantDoc.price,
                _id: variantDoc._id
              };
            } else {
              item.variant.stock = 0;
            }
          } catch (err) {
            console.error('Error fetching variant:', err);
            item.variant.stock = 0;
          }
        }
      }
    }

    res.status(200).json({ products: cart.products });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', message: err.message, products: [] });
  }
});

// Add product to cart (creates cart if not exist)
router.post('/add-to-cart', async (req, res) => {
  try {
    const { user_id, productId, variantId, quantity = 1 } = req.body;

    if (!user_id || !productId || !variantId) {
      return res.status(400).json({ error: 'Thiếu user_id, productId hoặc variantId' });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    const variant = await VariantProduct.findById(variantId).lean();
    if (!variant || String(variant.product_id) !== String(productId)) {
      return res.status(404).json({ error: 'Không tìm thấy biến thể hợp lệ' });
    }

    if (!variant || variant.stock < quantity) {
      return res.status(400).json({
        error: 'Số lượng vượt quá tồn kho',
        maxStock: variant.stock,
        details: `Biến thể này chỉ còn ${variant.stock} sản phẩm`
      });
    }

    let cart = await Cart.findOne({ user_id });
    if (!cart) {
      cart = new Cart({ user_id, products: [] });
    }

    // Tạo unique key bằng cách kết hợp productId và variantId
    const existing = cart.products.find(
      p => String(p.productId) === String(productId) && 
          p.variant && 
          String(p.variant._id) === String(variant._id)
    );

    if (existing) {
      if (existing.quantity + quantity > variant.stock) {
        return res.status(400).json({
          error: 'Số lượng vượt quá tồn kho',
          maxStock: variant.stock,
          details: `Biến thể này chỉ còn ${variant.stock} sản phẩm`
        });
      }
      existing.quantity += quantity;
    } else {
      // Thêm mới item với unique _id cho variant
      cart.products.push({
        productId,
        quantity,
        variant: {
          key: 'Phiên bản',
          label: variant.name,
          stock: variant.stock,
          price: variant.price,
          _id: variant._id // Đảm bảo lưu variantId
        }
      });
    }

    await cart.save();

    // Populate đầy đủ thông tin trả về
    const populated = await Cart.findById(cart._id)
      .populate('products.productId')
      .lean();

    res.json({ success: true, cart: populated });
  } catch (err) {
    console.error('Error in add-to-cart:', err);
    res.status(500).json({ error: err.message });
  }
});
// Update quantity with proper stock validation
router.put('/update-quantity', async (req, res) => {
  try {
    const { user_id, productId, comboId, variant = {}, quantity } = req.body;

    if (!user_id || (!productId && !comboId) || !quantity) {
      return res.status(400).json({ error: 'Thiếu thông tin đầu vào.' });
    }

    const cart = await Cart.findOne({ user_id });
    if (!cart) return res.status(404).json({ error: 'Giỏ hàng không tồn tại.' });

    let item;
    if (comboId) {
      item = cart.products.find(p => p.comboId && p.comboId.toString() === comboId);
      // ...xử lý combo nếu cần...
    } else {
      item = cart.products.find(p => {
        if (p.productId.toString() !== productId) return false;
        if (variant.label) {
          return p.variant?.label === variant.label;
        }
        return true;
      });

      if (!item) return res.status(404).json({ error: 'Không tìm thấy sản phẩm trong giỏ hàng.' });

      // Kiểm tra tồn kho
      let availableStock = 0;
      if (item.variant && item.variant.label) {
        const variantDoc = await VariantProduct.findOne({
          product_id: productId,
          name: item.variant.label
        });
        if (!variantDoc) {
          return res.status(404).json({ error: 'Không tìm thấy biến thể sản phẩm' });
        }
        availableStock = variantDoc.stock;
        if (quantity > availableStock) {
          // KHÔNG cập nhật item.quantity ở backend!
          return res.status(400).json({
            error: 'Số lượng vượt quá tồn kho',
            maxStock: availableStock,
            details: `Biến thể ${variantDoc.name} chỉ còn ${availableStock} sản phẩm`
          });
        }
      } else {
        const product = await Product.findById(productId);
        if (!product) {
          return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
        }
        availableStock = product.stock;
        if (quantity > availableStock) {
          return res.status(400).json({
            error: 'Số lượng vượt quá tồn kho',
            maxStock: availableStock,
            details: `Sản phẩm chỉ còn ${availableStock}`
          });
        }
      }

      // Cập nhật số lượng nếu hợp lệ
      item.quantity = quantity;
    }

    await cart.save();

    const populated = await Cart.findById(cart._id)
      .populate('products.productId')
      .populate({
        path: 'products.comboId',
        populate: { path: 'productIds', model: 'Product' }
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

    if (!updated) return res.status(404).json({ error: 'Giỏ hàng không tồn tại.' });

    res.status(200).json(updated);
  } catch (err) {
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
      if (!prod) return res.status(400).json({ error: 'Sản phẩm không tồn tại trong hệ thống' });

      let itemPrice = prod.price;
      // Nếu có biến thể thì kiểm tra tồn kho và trừ vào VariantProduct
      if (item.variant && item.variant.label) {
        const variantDoc = await VariantProduct.findOne({
          product_id: prod._id,
          name: item.variant.label
        });
        if (!variantDoc) return res.status(400).json({ error: 'Không tìm thấy biến thể.' });
        itemPrice = variantDoc.price;
        if (variantDoc.stock < item.quantity) {
          return res.status(400).json({ error: `Biến thể ${variantDoc.name} chỉ còn ${variantDoc.stock}` });
        }
        // Trừ tồn kho của biến thể
        await VariantProduct.updateOne(
          { _id: variantDoc._id },
          { $inc: { stock: -item.quantity } }
        );
      } else {
        // Nếu không có biến thể thì trừ vào sản phẩm gốc
        if (prod.stock < item.quantity) {
          return res.status(400).json({ error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock}` });
        }
        await Product.updateOne(
          { _id: prod._id },
          { $inc: { stock: -item.quantity } }
        );
      }
      totalPrice += itemPrice * item.quantity;
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

// Xóa toàn bộ sản phẩm trong giỏ hàng của user
router.delete('/clear', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id || !mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: 'Thiếu hoặc sai user_id.' });
    }

    const cart = await Cart.findOne({ user_id });
    if (!cart) {
      return res.status(404).json({ error: 'Giỏ hàng không tồn tại.' });
    }

    cart.products = [];
    await cart.save();

    res.status(200).json({ message: 'Đã xóa toàn bộ sản phẩm trong giỏ hàng.' });
  } catch (err) {
    console.error('Error in clear cart:', err);
    res.status(500).json({ error: err.message });
  }
});
router.put('/update-variant', async (req, res) => {
  try {
    const { user_id, productId, oldVariant = {}, newVariantId } = req.body;
    if (!user_id || !productId || !newVariantId) {
      return res.status(400).json({ error: 'Thiếu thông tin đầu vào.' });
    }

    const cart = await Cart.findOne({ user_id });
    if (!cart) return res.status(404).json({ error: 'Giỏ hàng không tồn tại.' });

    // Tìm đúng sản phẩm trong giỏ hàng theo productId và oldVariant
    const item = cart.products.find(p =>
      String(p.productId) === String(productId) &&
      (!oldVariant.label || (p.variant && p.variant.label === oldVariant.label))
    );
    if (!item) return res.status(404).json({ error: 'Không tìm thấy sản phẩm trong giỏ hàng.' });

    // Lấy thông tin biến thể mới
    const variant = await VariantProduct.findById(newVariantId).lean();
    if (!variant || String(variant.product_id) !== String(productId)) {
      return res.status(404).json({ error: 'Không tìm thấy biến thể mới hợp lệ' });
    }

    // Cập nhật lại trường variant và giá
    item.variant = {
      key: 'Phiên bản',
      label: variant.name,
      stock: variant.stock,
      price: variant.price,
      _id: variant._id
    };

    // Nếu số lượng đang lớn hơn tồn kho mới thì giảm về tồn kho mới
    if (item.quantity > variant.stock) {
      item.quantity = variant.stock;
    }

    await cart.save();

    const populated = await Cart.findById(cart._id)
      .populate('products.productId')
      .populate({
        path: 'products.comboId',
        populate: { path: 'productIds', model: 'Product' }
      });

    res.status(200).json(populated);
  } catch (err) {
    console.error('Error in update-variant:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🆕 Add combo to cart
router.post('/add-combo', async (req, res) => {
  try {
    const { user_id, comboId, variants = [], quantity = 1 } = req.body;

    if (!user_id || !comboId) {
      return res.status(400).json({ error: 'Thiếu user_id hoặc comboId' });
    }

    // Kiểm tra combo tồn tại
    const combo = await Combo.findById(comboId)
      .populate('productIds')
      .populate('variants');
    
    if (!combo) {
      return res.status(404).json({ error: 'Không tìm thấy combo' });
    }

    // Kiểm tra variants hợp lệ
    for (const variantId of variants) {
      const variant = await VariantProduct.findById(variantId);
      if (!variant) {
        return res.status(404).json({ error: `Không tìm thấy biến thể ${variantId}` });
      }
      // Kiểm tra tồn kho của biến thể
      if (variant.stock < quantity) {
        return res.status(400).json({ 
          error: 'Số lượng vượt quá tồn kho',
          maxStock: variant.stock,
          variantName: variant.name
        });
      }
    }

    // Tìm hoặc tạo giỏ hàng
    let cart = await Cart.findOne({ user_id });
    if (!cart) {
      cart = new Cart({ user_id, products: [] });
    }

    // Kiểm tra combo đã có trong giỏ với cùng variants chưa
    const existing = cart.products.find(p => 
      p.comboId?.toString() === comboId.toString() && 
      JSON.stringify(p.variants?.sort()) === JSON.stringify(variants.sort())
    );

    if (existing) {
      // Cập nhật số lượng nếu đã có
      existing.quantity += quantity;
    } else {
      // Thêm mới nếu chưa có
      cart.products.push({
        comboId,
        quantity,
        variants, // Lưu mảng variant ids
        price: combo.price // Giá combo
      });
    }

    await cart.save();

    // Populate đầy đủ thông tin trả về
    const populated = await Cart.findById(cart._id)
      .populate('products.productId')
      .populate({
        path: 'products.comboId',
        populate: [
          { 
            path: 'productIds',
            populate: [
              { path: 'category_id' },
              { path: 'brand_id' }
            ]
          },
          { path: 'variants' }
        ]
      });

    res.json({ success: true, cart: populated });

  } catch (err) {
    console.error('Error in add-combo:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;