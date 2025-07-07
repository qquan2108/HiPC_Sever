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

// Upload products from Excel file
exports.uploadProductsFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const xlsx = require('xlsx');
    const fs = require('fs');

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const created = [];
    for (const row of rows) {
      if (!row.name || !row.category_id || !row.price) continue;

      const product = new Product({
        name: row.name,
        category_id: row.category_id,
        brand_id: row.brand_id || null,
        price: row.price,
        description: row.description || '',
        stock: row.stock || 0,
      });
      await product.save();
      created.push(product);
    }

    fs.unlink(req.file.path, () => {});
    res.json({ success: true, createdCount: created.length });
  } catch (err) {
    console.error('Error in uploadProductsFromExcel:', err);
    res.status(500).json({ error: err.message });
  }
};

// Export all products to Excel file
exports.exportProductsToExcel = async (req, res) => {
  try {
    const products = await Product.find()
      .populate('category_id', 'name')
      .populate('brand_id', 'name')
      .lean();

    const rows = products.map(p => ({
      name: p.name,
      category: p.category_id?.name || '',
      brand: p.brand_id?.name || '',
      price: p.price,
      stock: p.stock,
      description: p.description
    }));

    const xlsx = require('xlsx');
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, 'Products');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="products.xlsx"'
    );
    res.send(buf);
  } catch (err) {
    console.error('Error in exportProductsToExcel:', err);
    res.status(500).json({ error: err.message });
  }
};

