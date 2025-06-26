// controllers/productCtrl.js
const Product     = require('../models/Product');
const Image       = require('../models/Image');
const TsktProduct = require('../models/TsktProduct');

// Create product
exports.createProduct = async (req, res) => {
  try {
    const { name, category_id, brand_id, price, description = '', stock = 0, specifications = [] } = req.body;
    if (!Array.isArray(specifications)) {
      return res.status(400).json({ error: 'specifications phải là mảng' });
    }

    const newItem = new Product({ name, category_id, brand_id, price, description, stock, specifications });
    await newItem.save();

    // Save image URL if provided
    if (req.body.image) {
      const newImage = new Image({ product_id: newItem._id, url: req.body.image });
      await newImage.save();
    }

    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { name, category_id, brand_id, price, description = '', stock = 0, specifications = [] } = req.body;
    if (!Array.isArray(specifications)) {
      return res.status(400).json({ error: 'specifications phải là mảng' });
    }

    const updates = { name, category_id, brand_id, price, description, stock, specifications };
    const updated = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    // Replace image if provided
    if (req.body.image) {
      await Image.deleteMany({ product_id: updated._id });
      const newImage = new Image({ product_id: updated._id, url: req.body.image });
      await newImage.save();
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get paginated products with primary image
exports.getProducts = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find()
        .skip(skip)
        .limit(limit)
        .populate('category_id', 'name')
        .populate('brand_id', 'name'),
      Product.countDocuments(),
    ]);

    const productsWithImage = await Promise.all(
      products.map(async p => {
        const image = await Image.findOne({ product_id: p._id });
        return { ...p.toObject(), image: image ? image.url : null };
      })
    );

    res.json({ products: productsWithImage, hasMore: skip + productsWithImage.length < total });
  } catch (err) {
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
    if (!item) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    // Fetch images
    const images = await Image.find({ product_id: item._id });
    const primaryImage = images[0]?.url || null;

    // Fetch TSKT template for this category
    const tpl = await TsktProduct.findOne({ category_id: item.category_id._id }).lean();
    let tskt = [];
    if (tpl) {
      tskt = tpl.value.map(key => {
        const spec = item.specifications.find(s => s.key === key);
        return { label: key, value: spec ? spec.value : '' };
      });
    }

    res.json({
      ...item,
      image:  primaryImage,
      images: images.map(img => img.url),
      tskt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete product and its images
exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    await Image.deleteMany({ product_id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
