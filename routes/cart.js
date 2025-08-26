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
      .populate({
        path: 'products.productId',
        populate: [
          { path: 'category_id' },
          { path: 'brand_id' }
        ]
      })
      .populate({
        path: 'products.comboId',
        populate: {
          path: 'productIds',
          populate: [
            { path: 'category_id' },
            { path: 'brand_id' }
          ]
        }
      })
      .lean();

    if (!cart) {
      return res.status(200).json({ products: [] });
    }

    // Process each item in cart
    const processedProducts = await Promise.all(cart.products.map(async (item) => {
      if (item.type === 'combo') {
        const combo = item.comboId;
        if (!combo) return item;

        // Create map of selected variants from comboSelections
        const selectionMap = item.comboSelections ? 
          Object.fromEntries(
            item.comboSelections.map(s => [String(s.productId), s])
          ) : {};

        // Process each product in combo
        const productsWithVariants = await Promise.all(
          combo.productIds.map(async (product) => {
            // Get selected variant info
            const selection = selectionMap[String(product._id)];
            
            // Get product image
            const productImage = await Image.findOne({ 
              product_id: product._id 
            }).lean();

            // Get all variants
            const variants = await VariantProduct.find({ 
              product_id: product._id 
            }).lean();

            // Get selected variant details if exists
            const selectedVariant = selection ? 
              await VariantProduct.findById(selection.variantId).lean() : 
              variants[0];

            return {
              ...product,
              image: productImage?.url || null,
              variants: variants.map(v => ({
                _id: v._id,
                name: v.name,
                price: v.price,
                stock: v.stock
              })),
              selectedVariant: selectedVariant ? {
                _id: selectedVariant._id,
                name: selectedVariant.name,
                price: selectedVariant.price,
                stock: selectedVariant.stock,
                priceDiff: selectedVariant.price - product.price
              } : null
            };
          })
        );

        // Update combo with processed products
        return {
          ...item,
          comboId: {
            ...combo,
            productIds: productsWithVariants
          },
          comboDetails: {
            name: combo.name,
            image: combo.image,
            price: combo.price,
            products: productsWithVariants,
            totalOriginalPrice: productsWithVariants.reduce((sum, p) => 
              sum + (p.selectedVariant?.price || p.price), 0
            ),
            description: combo.description || '',
            productCount: productsWithVariants.length
          }
        };
      } else {
        // Handle regular product
        if (item.productId?._id) {
          const imgDoc = await Image.findOne({ product_id: item.productId._id });
          return {
            ...item,
            productId: {
              ...item.productId,
              image: imgDoc?.url || null
            }
          };
        }
      }
      return item;
    }));

    res.status(200).json({ 
      products: processedProducts,
      totalItems: processedProducts.length,
      hasCombo: processedProducts.some(p => p.type === 'combo')
    });

  } catch (err) {
    console.error('Error fetching cart:', err);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: err.message, 
      products: [] 
    });
  }
});

// Add product to cart (creates cart if not exist)
router.post('/add-to-cart', async (req, res) => {
  try {
    const { user_id, productId, variantId, variant, quantity = 1 } = req.body;

    if (!user_id || !productId) {
      return res.status(400).json({ error: 'Thiếu user_id hoặc productId' });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    // Tìm variant theo id hoặc theo tên/label nếu có
    let variantDoc = null;
    if (variantId) {
      variantDoc = await VariantProduct.findById(variantId).lean();
    } else if (variant?.name || variant?.label) {
      variantDoc = await VariantProduct.findOne({
        product_id: productId,
        name: variant.name || variant.label
      }).lean();
    }

    // Nếu product có biến thể trong DB mà vẫn không resolve được => bắt chọn
    const hasVariantInDB = await VariantProduct.exists({ product_id: productId });
    if (hasVariantInDB && !variantDoc) {
      return res.status(400).json({ error: 'Vui lòng chọn biến thể hợp lệ cho sản phẩm này' });
    }

    // Xác thực tồn kho/giá theo variant (nếu có), không thì dùng giá base
    const usePrice = variantDoc?.price ?? product.price;
    const stock = variantDoc?.stock ?? product.stock; // nếu product không dùng stock tổng thì bỏ dòng này

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Số lượng phải lớn hơn 0' });
    }
    if (typeof stock === 'number' && quantity > stock) {
      return res.status(400).json({
        error: 'Số lượng vượt quá tồn kho',
        maxStock: stock
      });
    }

    let cart = await Cart.findOne({ user_id });
    if (!cart) cart = new Cart({ user_id, products: [] });

    // Key duy nhất theo (productId + variantId nếu có)
    const existing = cart.products.find(p =>
      String(p.productId) === String(productId) &&
      (
        (variantDoc && p.variant && String(p.variant._id) === String(variantDoc._id)) ||
        (!variantDoc && !p.variant) // sản phẩm không có biến thể
      )
    );

    if (existing) {
      if (typeof stock === 'number' && existing.quantity + quantity > stock) {
        return res.status(400).json({ error: 'Số lượng vượt quá tồn kho', maxStock: stock });
      }
      existing.quantity += quantity;
    } else {
      cart.products.push({
        productId,
        quantity,
        price: usePrice,
        variant: variantDoc ? {
          _id: variantDoc._id,
          key: variant?.key || 'Phiên bản',
          label: variantDoc.name,
          stock: variantDoc.stock,
          price: variantDoc.price
        } : undefined
      });
    }

    await cart.save();

    const populated = await Cart.findById(cart._id)
      .populate('products.productId')
      .lean();

    res.json({ success: true, cart: populated });
  } catch (err) {
    console.error('Error in add-to-cart:', err);
    res.status(500).json({ error: err.message });
  }
});
router.put('/update-quantity', async (req, res) => {
  try {
    const {
     user_id,
     productId,        // new
     product_id,       // legacy
     comboId,          // new
     combo_id,         // legacy
     variant_id,       // legacy
     variantId,        // new
     variant,          // { _id, ... }
     quantity
   } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    // Find existing cart
    let cart = await Cart.findOne({ user_id });
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    // Use either productId or product_id
    const actualProductId = productId || product_id;
    const actualComboId = comboId || combo_id;
    const bodyVariantId   = variant_id || variantId || variant?._id || null;

    if (actualProductId) {
      // Update product quantity
       const productIndex = cart.products.findIndex(item =>
       String(item.productId) === String(actualProductId) &&
       (bodyVariantId
         ? String(item.variant?._id) === String(bodyVariantId)   // có biến thể → match theo _id
         : !item.variant?._id)                                   // không biến thể → item không có variant
     );

      if (productIndex === -1) {
        return res.status(404).json({ error: 'Product not found in cart' });
      }

      // Check stock
      const product = await Product.findById(actualProductId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (bodyVariantId) {
       const variant = await VariantProduct.findById(bodyVariantId);
        if (!variant) {
          return res.status(404).json({ error: 'Variant not found' });
        }

        if (variant.stock < quantity) {
          return res.status(400).json({
           error: 'Số lượng vượt quá tồn kho',
           maxStock: variant.stock,
           details: `Biến thể ${variant.name} chỉ còn ${variant.stock} sản phẩm`
         });
        }
      } else {
        if (product.stock < quantity) {
          return res.status(400).json({
           error: 'Số lượng vượt quá tồn kho',
           maxStock: product.stock,
           details: `Sản phẩm ${product.name} chỉ còn ${product.stock} sản phẩm`
         });
        }
      }

      cart.products[productIndex].quantity = quantity;

    } else if (actualComboId) {
      // Find combo in products array where type is 'combo'
      const comboIndex = cart.products.findIndex(item => 
        item.type === 'combo' && 
        String(item.comboId) === String(actualComboId)
      );

      if (comboIndex === -1) {
        return res.status(404).json({ error: 'Combo not found in cart' });
      }

      // Check stock for all products in combo
      const combo = await Combo.findById(actualComboId).populate('productIds');
      if (!combo) {
        return res.status(404).json({ error: 'Combo not found' });
      }

      // Validate stock for each product in combo
      const comboProducts = cart.products[comboIndex].comboDetails?.products || [];
      for (const product of comboProducts) {
        const selectedVariant = product.selectedVariant;
        if (selectedVariant) {
          if (selectedVariant.stock < quantity) {
            return res.status(400).json({
       error: 'Số lượng vượt quá tồn kho',
     maxStock: selectedVariant.stock,
      details: `Sản phẩm ${product.name} (${selectedVariant.name}) chỉ còn ${selectedVariant.stock}`
      });
          }
        } else {
          if (product.stock < quantity) {
            return res.status(400).json({
              error: 'Not enough stock for combo product',
              productName: product.name,
              availableStock: product.stock
            });
          }
        }
      }

      cart.products[comboIndex].quantity = quantity;
    } else {
      return res.status(400).json({ error: 'Missing productId or comboId' });
    }

    // Save updated cart
    await cart.save();

    // Return updated cart with populated data
    const updatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'products.productId',
        populate: [
          { path: 'category_id', select: 'name' },
          { path: 'brand_id', select: 'name' }
        ]
      })
      .populate({
        path: 'products.comboId',
        populate: {
          path: 'productIds',
          populate: [
            { path: 'category_id', select: 'name' },
            { path: 'brand_id', select: 'name' }
          ]
        }
      })
      .lean();

    res.json({
      message: 'Cart updated successfully',
      cart: updatedCart
    });

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
router.post('/add-combo', async (req, res) => {
  try {
    const { user_id, comboId, selectedVariants = [], quantity = 1 } = req.body;

    if (!user_id || !comboId) {
      return res.status(400).json({ error: 'Thiếu user_id hoặc comboId' });
    }

    // Fetch combo with populated products
    const combo = await Combo.findById(comboId)
      .populate({
        path: 'productIds',
        populate: [
          { path: 'category_id' },
          { path: 'brand_id' }
        ]
      });
    
    if (!combo) {
      return res.status(404).json({ error: 'Không tìm thấy combo' });
    }

    // Process variants and create comboSelections
    const comboSelections = [];
    const detailedComboProducts = [];
    let totalOriginalPrice = 0;
    const comboDescription = [];

    for (const product of combo.productIds) {
      const selectedVariant = selectedVariants.find(v => 
        v.productId === product._id.toString()
      );

      // Get all variants for this product
      const allVariants = await VariantProduct.find({ 
        product_id: product._id 
      }).lean();

      let selectedVariantInfo = null;
      let productPrice = product.price;

      if (selectedVariant) {
        const variant = await VariantProduct.findById(selectedVariant.variantId);
        if (!variant) {
          return res.status(404).json({ 
            error: `Không tìm thấy biến thể cho sản phẩm ${product.name}` 
          });
        }

        if (variant.stock < quantity) {
          return res.status(400).json({
            error: 'Số lượng vượt quá tồn kho',
            productName: product.name,
            variantName: variant.name,
            maxStock: variant.stock
          });
        }

        selectedVariantInfo = {
          _id: variant._id,
          name: variant.name,
          price: variant.price,
          stock: variant.stock
        };
        productPrice = variant.price;

        // Add to comboSelections
        comboSelections.push({
          productId: product._id,
          variantId: variant._id,
          label: variant.name,
          priceDiff: variant.price - product.price
        });
      }

      // Add variant description
      const variantDescription = selectedVariantInfo ? 
        `${product.name} - ${selectedVariantInfo.name}` : 
        `${product.name} - Phiên bản cơ bản`;

      comboDescription.push(variantDescription);

      totalOriginalPrice += productPrice;

      // Lấy ảnh sản phẩm
      const image = await Image.findOne({ product_id: product._id });

      // Lấy thông số kỹ thuật nếu có
      const specifications = product.specifications || [];

      // Lấy đánh giá nếu có
      const rating = product.rating || 0;
      const reviewCount = product.reviewCount || 0;

      detailedComboProducts.push({
        _id: product._id,
        productId: product._id,
        name: product.name,
        image: image ? image.url : null,
        price: product.price,
        stock: product.stock,
        
        // Add detailed variant description
        variantDescription: variantDescription,
        selectedVariantName: selectedVariantInfo?.name || 'Phiên bản cơ bản',
        selectedVariantPrice: productPrice,
        
        // Brand and category info
        brand_id: product.brand_id ? {
          _id: product.brand_id._id,
          name: product.brand_id.name
        } : null,
        category_id: product.category_id ? {
          _id: product.category_id._id,
          name: product.category_id.name
        } : null,

        // Selected variant info
        selectedVariant: selectedVariantInfo,
        
        // Additional variant details
        isVariantSelected: !!selectedVariantInfo,
        priceIncreaseFromBase: selectedVariantInfo ? 
          (selectedVariantInfo.price - product.price) : 0,
        
        // Available variants
        variants: allVariants.map(v => ({
          _id: v._id,
          name: v.name,
          price: v.price,
          stock: v.stock,
          priceDiff: v.price - product.price
        })),

        specifications: specifications.slice(0, 5),
        rating: rating,
        reviewCount: reviewCount
      });
    }

    // Tính toán tiết kiệm
    const discount = totalOriginalPrice - combo.price;
    const discountPercentage = discount > 0 ? Math.round((discount / totalOriginalPrice) * 100) : 0;

    // Thêm vào giỏ hàng
    let cart = await Cart.findOne({ user_id });
    if (!cart) {
      cart = new Cart({ user_id, products: [] });
    }

    // Tạo unique identifier cho combo (bao gồm các variant đã chọn)
    const comboSignature = JSON.stringify(
      selectedVariants.sort((a, b) => a.productId.localeCompare(b.productId))
    );

    // Kiểm tra combo đã tồn tại với cùng cấu hình variant
    const existingComboIndex = cart.products.findIndex(p => 
      p.comboId?.toString() === comboId.toString() &&
      p.comboSignature === comboSignature
    );

    if (existingComboIndex !== -1) {
      // Cập nhật số lượng nếu combo đã tồn tại
      cart.products[existingComboIndex].quantity += quantity;
      cart.products[existingComboIndex].comboSelections = comboSelections;
    } else {
      // Thêm combo mới
      cart.products.push({
        comboId,
        quantity,
        type: 'combo',
        price: combo.price,
        comboSignature,
        comboSelections, // Add the selections here
        name: combo.name,
        image: combo.image || detailedComboProducts[0]?.image || null,
        fullDescription: `Combo ${combo.name} gồm: ${comboDescription.join(', ')}`,
        shortDescription: comboDescription.join(' + '),
        productIds: detailedComboProducts,
        productDetails: detailedComboProducts,
        products: detailedComboProducts,
        originalPrice: totalOriginalPrice,
        discount: totalOriginalPrice - combo.price,
        discountPercentage: Math.round(((totalOriginalPrice - combo.price) / totalOriginalPrice) * 100),
        variantsInfo: detailedComboProducts.map(p => ({
          productName: p.name,
          selectedVariant: p.selectedVariantName,
          price: p.selectedVariantPrice,
          brand: p.brand_id?.name,
          category: p.category_id?.name
        }))
      });
    }

    await cart.save();

    // Return populated cart
    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'products.comboId',
        populate: {
          path: 'productIds',
          populate: [
            { path: 'category_id' },
            { path: 'brand_id' }
          ]
        }
      });

    res.json({
      success: true,
      cart: populatedCart,
      message: `Đã thêm combo "${combo.name}" vào giỏ hàng`
    });

  } catch (err) {
    console.error('Error in add-combo:', err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;