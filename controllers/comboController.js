const Combo = require('../models/Combo');
const Product = require('../models/Product');
const Image = require('../models/Image');
const VariantProduct = require('../models/Variantproduct'); // Fix case here

// 👉 Tạo combo mới
exports.createCombo = async (req, res) => {
  try {
    const { name, products, price, image } = req.body;

    // Validate products array có chứa productId và variantId
    if (!Array.isArray(products)) {
      return res.status(400).json({ 
        error: 'products phải là một mảng các sản phẩm với biến thể' 
      });
    }

    // Kiểm tra và lấy default variant nếu không có variantId
    const productIds = await Promise.all(
      products.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product) {
          throw new Error(`Không tìm thấy sản phẩm với id ${item.productId}`);
        }

        // Nếu không có variantId, lấy biến thể đầu tiên
        if (!item.variantId) {
          const defaultVariant = await VariantProduct.findOne({
            product_id: item.productId
          });
          if (defaultVariant) {
            item.variantId = defaultVariant._id;
          }
        }

        return {
          productId: item.productId,
          variantId: item.variantId
        };
      })
    );

    const combo = new Combo({
      name,
      productIds: productIds.map(p => p.productId),
      variants: productIds.map(p => p.variantId), // Lưu variantId cho mỗi sản phẩm
      price,
      image
    });

    await combo.save();
    res.status(201).json(combo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// 👉 Lấy tất cả combo + gắn ảnh cho từng sản phẩm trong combo
exports.getAllCombos = async (req, res) => {
  try {
    // 1. Lấy danh sách combo và sản phẩm liên quan
    const combos = await Combo.find()
      .populate({
        path: 'productIds',
        populate: [
          { path: 'category_id', select: 'name' },
          { path: 'brand_id', select: 'name' }
        ]
      })
      .lean();

    // 2. Lấy danh sách product_id
    const allProductIds = combos.flatMap(combo =>
      combo.productIds.map(p => p._id.toString())
    );

    // 3. Tìm ảnh trong bảng Image
    const images = await Image.find({
      product_id: { $in: allProductIds }
    }).lean();

    const imageMap = {};
    images.forEach(img => {
      if (!imageMap[img.product_id]) {
        imageMap[img.product_id] = img.url;
      }
    });

    // 4. Gắn ảnh vào từng sản phẩm trong combo
    const combosWithImages = combos.map(combo => ({
      ...combo,
      productIds: combo.productIds.map(p => ({
        ...p,
        image: imageMap[p._id.toString()] || ''
      }))
    }));

    // 5. Trả kết quả
    res.json(combosWithImages);
  } catch (err) {
    console.error('Error in getAllCombos:', err);
    res.status(500).json({ message: err.message });
  }
};
