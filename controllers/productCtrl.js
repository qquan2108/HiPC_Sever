const Product = require('../models/Product');

// Tạo mới product
exports.createProduct = async (req, res) => {
  try {
    const {
      name, category_id, brand_id,
      price, description = '', stock = 0,
      image = '', specifications = []
    } = req.body;

    if (!Array.isArray(specifications)) {
      return res.status(400).json({ error: 'specifications phải là mảng' });
    }

    const newItem = new Product({
      name, category_id, brand_id,
      price, description, stock,
      image, specifications
    });
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Cập nhật product
exports.updateProduct = async (req, res) => {
  try {
    const {
      name, category_id, brand_id,
      price, description = '', stock = 0,
      image = '', specifications = []
    } = req.body;

    if (!Array.isArray(specifications)) {
      return res.status(400).json({ error: 'specifications phải là mảng' });
    }

    const updates = { name, category_id, brand_id, price, description, stock, image, specifications };
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Lấy danh sách và chi tiết
exports.getProducts = async (req, res) => {
  const list = await Product.find()
    .populate('category_id', 'name')
    .populate('brand_id', 'name');
  res.json(list);
};

exports.getProductById = async (req, res) => {
  const p = await Product.findById(req.params.id)
    .populate('category_id', 'name')
    .populate('brand_id', 'name');
  if (!p) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  res.json(p);
};

// Xóa product
exports.deleteProduct = async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};