const TsktProduct = require('../models/TsktProduct');

// Tạo template đơn lẻ (value là array)
exports.createTskt = async (req, res) => {
  try {
    const { category_id, value,variantOptions } = req.body;
    if (!Array.isArray(value)) {
      return res.status(400).json({ error: 'value phải là mảng chuỗi' });
    }
    const item = new TsktProduct({ category_id, value,variantOptions });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Bulk tạo template nhiều mục
exports.createTsktBulk = async (req, res) => {
  try {
    const items = req.body; // mong đợi mảng [{ category_id, value: [String] }, ...]
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Body phải là mảng các đối tượng {category_id, value: [String]}' });
    }
    items.forEach(it => {
      if (!Array.isArray(it.value)) {
        throw new Error('Mỗi mục phải có value là mảng chuỗi');
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
exports.getFilterFieldsByCategory = async (req, res) => {
  try {
    const { category_id } = req.params;
    const template = await TsktProduct.findOne({ category_id }).lean();

    if (!template || !Array.isArray(template.value)) {
      return res.json({ fields: [] });
    }

    res.json({
  specs: template.specs,
  variantOptions: template.variantOptions
}); // trả về mảng ["socket", "core", "thread", ...]
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
