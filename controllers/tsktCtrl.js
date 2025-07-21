const TsktProduct = require('../models/TsktProduct');

// Tạo template đơn lẻ
exports.createTskt = async (req, res) => {
  try {
    const { category_id, specs = [], variantOptions = [] } = req.body;
    if (!Array.isArray(specs)) {
      return res.status(400).json({ error: 'specs phải là mảng chuỗi' });
    }
    const item = new TsktProduct({ category_id, specs, variantOptions });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Bulk tạo template nhiều mục
exports.createTsktBulk = async (req, res) => {
  try {
    const items = req.body; // mong đợi mảng [{ category_id, specs: [String] }, ...]
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Body phải là mảng các đối tượng {category_id, specs: [String]}' });
    }
    items.forEach(it => {
      if (!Array.isArray(it.specs)) {
        throw new Error('Mỗi mục phải có specs là mảng chuỗi');
      }
    });
    const docs = await TsktProduct.insertMany(items);
    res.status(201).json(docs);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Lấy tất cả template theo danh mục
exports.getByCategory = async (req, res) => {
  try {
    const list = await TsktProduct.find({ category_id: req.params.category_id });
    res.json(list);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Xóa template
exports.deleteTskt = async (req, res) => {
  try {
    await TsktProduct.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Cập nhật template theo ID
exports.updateTskt = async (req, res) => {
  try {
    const { category_id, specs = [], variantOptions = [] } = req.body;
    const updates = { category_id, specs, variantOptions };
    const updated = await TsktProduct.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ error: 'Không tìm thấy template' });
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
exports.getFilterFieldsByCategory = async (req, res) => {
  try {
    const { category_id } = req.params;
    const template = await TsktProduct.findOne({ category_id }).lean();

    if (!template || !Array.isArray(template.specs)) {
      return res.json({ specs: [], variantOptions: [] });
    }

    res.json({
      specs: template.specs,
      variantOptions: template.variantOptions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
