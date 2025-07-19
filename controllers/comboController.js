const Combo = require('../models/Combo');
const Product = require('../models/Product');
const Image = require('../models/Image');

// 👉 Tạo combo mới
exports.createCombo = async (req, res) => {
  try {
    const { name, productIds, price, image } = req.body;

    const combo = new Combo({
      name,
      productIds,
      price,
      image // đây là ảnh đại diện combo (không bắt buộc)
    });

    await combo.save();
    res.status(201).json(combo);
  } catch (err) {
    res.status(500).json({ message: err.message });
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
