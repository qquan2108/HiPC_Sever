const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Combo = require('../models/Combo');
const Product = require('../models/Product');
const Image = require('../models/Image'); // Add this line
const VariantProduct = require('../models/Variantproduct'); // Fix case here
const comboController = require('../controllers/comboController');

router.post('/', comboController.createCombo);
router.get('/', comboController.getAllCombos);

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid combo ID format.' });
    }

    const combo = await Combo.findById(id)
      .populate({
        path: 'productIds',
        populate: [
          { path: 'category_id', select: 'name' },
          { path: 'brand_id', select: 'name' }
        ]
      });
    
    if (!combo) {
      return res.status(404).json({ error: 'Combo không tồn tại.' });
    }

    // Xử lý ảnh combo
    let comboImage = combo.image;
    if (comboImage && comboImage.startsWith('data:image')) {
      // Nếu là base64, giữ nguyên
      comboImage = combo.image;
    } else if (comboImage) {
      // Nếu là URL, thêm domain nếu cần
      comboImage = comboImage.startsWith('http') ? 
        comboImage : `${process.env.BASE_URL || ''}${comboImage}`;
    }

    // Xử lý ảnh và biến thể cho từng sản phẩm
    const productsWithDetails = await Promise.all(
      combo.productIds.map(async (product) => {
        // Lấy ảnh sản phẩm
        const productImage = await Image.findOne({ 
          product_id: product._id 
        }).lean();

        // Xử lý ảnh sản phẩm
        let imageUrl = null;
        if (productImage) {
          if (productImage.url.startsWith('data:image')) {
            imageUrl = productImage.url;
          } else {
            imageUrl = productImage.url.startsWith('http') ? 
              productImage.url : `${process.env.BASE_URL || ''}${productImage.url}`;
          }
        }

        // Lấy biến thể
        const variants = await VariantProduct.find({ 
          product_id: product._id 
        }).lean();

        // Lấy biến thể mặc định từ combo.variants nếu có
        const defaultVariantId = combo.variants?.find(v => 
          v.toString() === variants[0]?._id.toString()
        );
        
        const defaultVariant = defaultVariantId ? 
          variants.find(v => v._id.toString() === defaultVariantId.toString()) :
          variants[0];

        return {
          ...product.toObject(),
          image: imageUrl,
          variants: variants.map(v => ({
            _id: v._id,
            name: v.name,
            price: v.price,
            stock: v.stock
          })),
          selectedVariant: defaultVariant ? {
            _id: defaultVariant._id,
            name: defaultVariant.name,
            price: defaultVariant.price,
            stock: defaultVariant.stock
          } : null
        };
      })
    );

    const result = {
      _id: combo._id,
      name: combo.name,
      price: combo.price,
      image: comboImage,
      productIds: productsWithDetails,
      variants: combo.variants,
      createdAt: combo.createdAt,
      updatedAt: combo.updatedAt
    };

    res.status(200).json(result);

  } catch (err) {
    console.error('Error fetching combo:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🆕 Get detailed combo information for display
router.get('/combo/:comboId/details', async (req, res) => {
  try {
    const { comboId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ error: 'Invalid combo ID format.' });
    }

    const combo = await Combo.findById(comboId)
      .populate({
        path: 'productIds',
        populate: [
          { path: 'category_id' },
          { path: 'brand_id' }
        ]
      });
    
    if (!combo) {
      return res.status(404).json({ error: 'Combo không tồn tại.' });
    }

    // Lấy thông tin chi tiết từng sản phẩm
    const detailedProducts = [];
    let totalOriginalPrice = 0;

    for (const product of combo.productIds) {
      // Lấy tất cả variants
      const variants = await VariantProduct.find({ 
        product_id: product._id 
      }).lean();

      // Lấy ảnh
      const image = await Image.findOne({ product_id: product._id });

      totalOriginalPrice += product.price;

      detailedProducts.push({
        _id: product._id,
        name: product.name,
        image: image?.url,
        price: product.price,
        stock: product.stock,
        brand: product.brand_id?.name,
        category: product.category_id?.name,
        variants: variants.map(v => ({
          _id: v._id,
          name: v.name,
          price: v.price,
          stock: v.stock,
          priceDiff: v.price - product.price
        })),
        specifications: product.specifications || [],
        rating: product.rating || 0,
        reviewCount: product.reviewCount || 0
      });
    }

    const discount = totalOriginalPrice - combo.price;
    const discountPercentage = discount > 0 ? Math.round((discount / totalOriginalPrice) * 100) : 0;

    res.json({
      combo: {
        _id: combo._id,
        name: combo.name,
        description: combo.description,
        image: combo.image,
        price: combo.price,
        originalPrice: totalOriginalPrice,
        discount: discount,
        discountPercentage: discountPercentage,
        products: detailedProducts,
        productCount: detailedProducts.length,
        createdAt: combo.createdAt,
        updatedAt: combo.updatedAt
      }
    });

  } catch (err) {
    console.error('Error in get combo details:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🆕 Update combo variant selection
router.put('/update-combo-variant', async (req, res) => {
  try {
    const { 
      user_id, 
      comboId, 
      productId, 
      oldVariantId, 
      newVariantId,
      comboSignature 
    } = req.body;

    if (!user_id || !comboId || !productId || !newVariantId) {
      return res.status(400).json({ error: 'Thiếu thông tin đầu vào.' });
    }

    const cart = await Cart.findOne({ user_id });
    if (!cart) return res.status(404).json({ error: 'Giỏ hàng không tồn tại.' });

    // Tìm combo trong giỏ hàng
    const comboItem = cart.products.find(p => 
      p.comboId?.toString() === comboId.toString() &&
      (comboSignature ? p.comboSignature === comboSignature : true)
    );

    if (!comboItem) {
      return res.status(404).json({ error: 'Không tìm thấy combo trong giỏ hàng.' });
    }

    // Lấy thông tin variant mới
    const newVariant = await VariantProduct.findById(newVariantId).lean();
    if (!newVariant) {
      return res.status(404).json({ error: 'Không tìm thấy biến thể mới.' });
    }

    // Kiểm tra tồn kho
    if (newVariant.stock < comboItem.quantity) {
      return res.status(400).json({
        error: 'Số lượng vượt quá tồn kho',
        maxStock: newVariant.stock,
        variantName: newVariant.name
      });
    }

    // Cập nhật variant trong productIds/productDetails/products
    ['productIds', 'productDetails', 'products'].forEach(field => {
      if (comboItem[field]) {
        const product = comboItem[field].find(p => 
          p._id?.toString() === productId.toString() ||
          p.productId?.toString() === productId.toString()
        );
        
        if (product) {
          product.selectedVariant = {
            _id: newVariant._id,
            name: newVariant.name,
            price: newVariant.price,
            stock: newVariant.stock
          };
        }
      }
    });

    // Tính lại giá combo nếu cần
    if (comboItem.productIds) {
      let newTotalPrice = 0;
      comboItem.productIds.forEach(product => {
        const price = product.selectedVariant?.price || product.price || 0;
        newTotalPrice += price;
      });
      comboItem.originalPrice = newTotalPrice;
      
      // Giữ nguyên giá combo, chỉ cập nhật discount
      const discount = newTotalPrice - comboItem.price;
      comboItem.discount = discount > 0 ? discount : 0;
      comboItem.discountPercentage = discount > 0 ? 
        Math.round((discount / newTotalPrice) * 100) : 0;
    }

    await cart.save();

    res.json({
      success: true,
      message: 'Đã cập nhật biến thể cho combo',
      updatedCombo: comboItem
    });

  } catch (err) {
    console.error('Error in update-combo-variant:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
