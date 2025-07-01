const Product     = require('../models/Product');
const Image       = require('../models/Image');
const TsktProduct = require('../models/TsktProduct');

// Create product
exports.createProduct = async (req, res) => {
  try {
    const {
      name, category_id, brand_id,
      price, description = '',
      stock = 0, specifications = []
    } = req.body;

    if (!Array.isArray(specifications)) {
      return res.status(400).json({ error: 'specifications phải là mảng' });
    }

    const newItem = new Product({
      name, category_id, brand_id,
      price, description, stock, specifications
    });
    await newItem.save();

    if (req.body.image) {
      await new Image({
        product_id: newItem._id,
        url: req.body.image
      }).save();
    }

    res.status(201).json(newItem);
  } catch (err) {
    console.error('Error in createProduct:', err);
    res.status(400).json({ error: err.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const {
      name, category_id, brand_id,
      price, description = '',
      stock = 0, specifications = []
    } = req.body;

    if (!Array.isArray(specifications)) {
      return res.status(400).json({ error: 'specifications phải là mảng' });
    }

    const updates = {
      name, category_id, brand_id,
      price, description, stock, specifications
    };
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    if (req.body.image) {
      await Image.deleteMany({ product_id: updated._id });
      await new Image({
        product_id: updated._id,
        url: req.body.image
      }).save();
    }

    res.json(updated);
  } catch (err) {
    console.error('Error in updateProduct:', err);
    res.status(400).json({ error: err.message });
  }
};

// Get paginated products with primary image
exports.getProducts = async (req, res) => {
  try {
    const page  = Math.max(1, +req.query.page  || 1);
    const limit = Math.max(1, +req.query.limit || 20);
    const skip  = (page - 1) * limit;
    const q     = (req.query.q || '').trim();

    const nameFilter = q ? { name: new RegExp(q, 'i') } : {};

    const [products, total] = await Promise.all([
      Product.find(nameFilter)
        .skip(skip)
        .limit(limit)
        .populate('category_id', 'name')
        .populate('brand_id', 'name')
        .lean(),
      Product.countDocuments(nameFilter)
    ]);

    const productsWithImage = await Promise.all(
      products.map(async p => {
        const img = await Image.findOne({ product_id: p._id }).lean();
        return { ...p, image: img ? img.url : null };
      })
    );

    res.json({
      products: productsWithImage,
      hasMore: skip + productsWithImage.length < total
    });
  } catch (err) {
    console.error('Error in getProducts:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get product by ID with all images and TSKT template data
exports.getProductById = async (req, res) => {
  try {
    const item = await Product.findById(req.params.id)
      .populate('category_id', 'name')
      .populate('brand_id', 'name')
      .lean();
    if (!item) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    // images
    const imgs = await Image.find({ product_id: item._id }).lean();
    const urls = imgs.map(i => i.url);
    const primaryImage = urls[0] || null;

    // TSKT template
    let tskt = [];
    if (item.category_id?._id) {
      const tpl = await TsktProduct.findOne({ category_id: item.category_id._id }).lean();
      if (tpl?.value && Array.isArray(tpl.value)) {
        tskt = tpl.value.map(key => {
          const spec = Array.isArray(item.specifications)
            ? item.specifications.find(s => s.key === key)
            : null;
          return { label: key, value: spec?.value || '' };
        });
      }
    }
    // fallback
    if (!tskt.length && Array.isArray(item.specifications)) {
      tskt = item.specifications.map(s => ({
        label: s.key  || '',
        value: s.value || ''
      }));
    }

    res.json({ ...item, image: primaryImage, images: urls, tskt });
  } catch (err) {
    console.error('Error in getProductById:', err);
    res.status(500).json({ error: 'Đã xảy ra lỗi máy chủ, vui lòng thử lại sau.' });
  }
};

// Delete product and its images
exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    await Image.deleteMany({ product_id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Error in deleteProduct:', err);
    res.status(400).json({ error: err.message });
  }
};
