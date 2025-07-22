const Product     = require('../models/Product');
const Image       = require('../models/Image');
const TsktProduct = require('../models/TsktProduct');
const mongoose    = require('mongoose');

// Create product
exports.createProduct = async (req, res) => {
  try {
    const {
  name, category_id, brand_id,
  price, description = '',
  stock = 0,
  specifications = [],
  variants = '{}'
} = req.body;

// Không cần tskt, chỉ dùng specifications
if (!Array.isArray(specifications)) {
  return res.status(400).json({ error: 'specifications phải là mảng' });
}

let parsedVariants = {};
try {
  if (variants) parsedVariants = JSON.parse(variants);
} catch (e) {
  return res.status(400).json({ error: 'variants phải là JSON hợp lệ' });
}

const newItem = new Product({
  name, category_id, brand_id,
  price, description, stock,
  specifications,
  variants: parsedVariants
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
  stock = 0,
  specifications = [],
  variants = '{}'
} = req.body;

if (!Array.isArray(specifications)) {
  return res.status(400).json({ error: 'specifications phải là mảng' });
}

let parsedVariants = {};
try {
  if (variants) parsedVariants = JSON.parse(variants);
} catch (e) {
  return res.status(400).json({ error: 'variants phải là JSON hợp lệ' });
}

const updates = {
  name, category_id, brand_id,
  price, description, stock,
  specifications,
  variants: parsedVariants
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
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error in getProducts:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get product by ID with all images and TSKT template data
exports.getProductById = async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID sản phẩm không hợp lệ' });
    }

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
      if (tpl?.specs && Array.isArray(tpl.specs)) {
        tskt = tpl.specs.map(key => {
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
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID sản phẩm không hợp lệ' });
    }

    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    await Image.deleteMany({ product_id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Error in deleteProduct:', err);
    res.status(400).json({ error: err.message });
  }
};
// Enhanced filter products with proper sorting and filtering
exports.filterProducts = async (req, res) => {
  try {
    const {
      q, category, brand, priceMin, priceMax,
      specKey, specValue, sort,
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};
    let sortOptions = {};

    // ------------------------
    // Text search
    // ------------------------
    if (q?.trim()) {
      filter.name = { $regex: q.trim(), $options: 'i' };
    }

    // ------------------------
    // Category filter
    // ------------------------
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      filter.category_id = new mongoose.Types.ObjectId(category);
    }

    // ------------------------
    // Brand filter (multi-id)
    // ------------------------
    if (brand) {
      const brandIds = brand.split(',')
        .map(id => id.trim())
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (brandIds.length > 0) {
        filter.brand_id = { $in: brandIds };
      }
    }

    // ------------------------
    // Price filter (Min / Max)
    // ------------------------
const min = priceMin && !isNaN(priceMin) ? parseFloat(priceMin) : null;
const max = priceMax && !isNaN(priceMax) ? parseFloat(priceMax) : null;

if (min !== null || max !== null) {
  filter.price = {};
  if (min !== null) filter.price.$gte = min;
  if (max !== null) filter.price.$lte = max;
}


    // DEBUG (bạn có thể tắt sau khi test)
    console.log('Parsed Price:', { min, max });
    console.log('Filter conditions:', filter);

    // ------------------------
    // Specification filter
    // ------------------------
    if (specKey && specValue) {
      const specValues = specValue.split(',').map(val => val.trim());
      filter.specifications = {
        $elemMatch: {
          key: specKey,
          value: { $in: specValues }
        }
      };
    }

    // ------------------------
    // Sorting options
    // ------------------------
    switch (sort) {
      case 'price_asc': sortOptions = { price: 1 }; break;
      case 'price_desc': sortOptions = { price: -1 }; break;
      case 'name_asc': sortOptions = { name: 1 }; break;
      case 'name_desc': sortOptions = { name: -1 }; break;
      case 'newest':
      case 'popular':
      case 'promotion':
      default: sortOptions = { createdAt: -1 }; break;
    }

    // ------------------------
    // Pagination
    // ------------------------
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // ------------------------
    // Query DB
    // ------------------------
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate('category_id', 'name')
        .populate('brand_id', 'name')
        .lean(),
      Product.countDocuments(filter)
    ]);

    // ------------------------
    // Fetch Images
    // ------------------------
    const productIds = products.map(p => p._id);
    const images = await Image.find({ product_id: { $in: productIds } }).lean();

const imageMap = {};
images.forEach(img => {
  if (img.url && !imageMap[img.product_id]) {
    imageMap[img.product_id] = img.url;
  }
});


const productsWithImages = products.map(p => ({
  ...p,
  image: imageMap[p._id.toString()] || null
}));


    // ------------------------
    // Response
    // ------------------------
    res.json({
      products: productsWithImages,
      total,
      page: pageNum,
      limit: limitNum,
      hasMore: skip + products.length < total,
      totalPages: Math.ceil(total / limitNum)
    });

  } catch (err) {
    console.error('Error in filterProducts:', err);
    res.status(500).json({ error: 'Đã xảy ra lỗi máy chủ, vui lòng thử lại sau.' });
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
    const errors = [];

    for (const row of rows) {
      try {
        if (!row.name || !row.category_id || !row.price) {
          errors.push(`Row skipped: Missing required fields (name, category_id, price)`);
          continue;
        }

        let specs = [];
        const rawSpecs = row.tskt || row.specifications;
        if (rawSpecs) {
          try {
            const parsed = typeof rawSpecs === 'string' ? JSON.parse(rawSpecs) : rawSpecs;
            if (Array.isArray(parsed)) specs = parsed;
          } catch (e) {
            errors.push(`Row ${row.name}: Invalid specifications format`);
          }
        }

        const product = new Product({
          name:        row.name,
          category_id: row.category_id,
          brand_id:    row.brand_id || undefined,
          price:       parseFloat(row.price),
          description: row.description || '',
          stock:       parseInt(row.stock) || 0,
          specifications: specs
        });
        
        await product.save();
        
        // Add image if provided
        if (row.image) {
          await new Image({
            product_id: product._id,
            url: row.image
          }).save();
        }
        
        created.push(product);
      } catch (error) {
        errors.push(`Row ${row.name || 'Unknown'}: ${error.message}`);
      }
    }

    // Clean up uploaded file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting uploaded file:', err);
    });

    res.json({ 
      success: true, 
      createdCount: created.length,
      errors: errors.length > 0 ? errors : undefined
    });
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

    const ids = products.map(p => p._id);
    const images = await Image.find({ product_id: { $in: ids } }).lean();
    const imageMap = {};
    images.forEach(img => {
      if (!imageMap[img.product_id]) imageMap[img.product_id] = img.url;
    });

    const rows = products.map(p => ({
      name:        p.name,
      category_id: p.category_id?._id?.toString() || '',
      category:    p.category_id?.name || '',
      brand_id:    p.brand_id?._id?.toString() || '',
      brand:       p.brand_id?.name || '',
      price:       p.price,
      description: p.description,
      stock:       p.stock,
      image:       imageMap[p._id] || '',
      specifications: JSON.stringify(p.specifications || [])
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
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};