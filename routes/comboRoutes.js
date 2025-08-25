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

module.exports = router;
