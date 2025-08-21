const express = require('express');
const router = express.Router();
const Build = require('../models/Build');
const BuildProduct = require('../models/BuildProduct');
const Product = require('../models/Product');
const { calculateTotalPrice, estimatePerformance, checkCompatibility } = require('../utils/pcBuilders');
const mongoose = require('mongoose');
const Preset = require('../models/Preset');
const Combo = require('../models/Combo');

// Preset builds với khả năng chỉnh sửa
let PRESET_BUILDS = [
  { 
    id: 'gaming', 
    name: 'Gaming PC', 
    description: 'Cấu hình chơi game mạnh mẽ', 
    components: [],
    estimatedPrice: 0,
    category: 'gaming'
  },
  { 
    id: 'workstation', 
    name: 'Workstation', 
    description: 'Cấu hình làm việc chuyên nghiệp', 
    components: [],
    estimatedPrice: 0,
    category: 'work'
  },
  { 
    id: 'budget', 
    name: 'Budget PC', 
    description: 'Tiết kiệm chi phí, hiệu quả cao', 
    components: [],
    estimatedPrice: 0,
    category: 'budget'
  }
];

// Lấy danh sách preset builds (MongoDB)
router.get('/presets', async (req, res) => {
  try {
    const presets = await Preset.find().populate('comboIds');
    // Tính số sản phẩm và giá ước tính cho mỗi preset
    const result = [];
    for (const preset of presets) {
      let components = [];
      let estimatedPrice = 0;
      for (const combo of preset.comboIds) {
        await combo.populate('productIds');
        for (const prod of combo.productIds) {
          if (!components.some(c => c.productId === prod._id.toString())) {
            components.push({
              productId: prod._id.toString(),
              name: prod.name,
              price: prod.price,
              quantity: 1
            });
            estimatedPrice += prod.price;
          }
        }
      }
      result.push({
        _id: preset._id,
        name: preset.name,
        description: preset.description,
        category: preset.category,
        comboIds: preset.comboIds.map(c => c._id),
        comboNames: preset.comboIds.map(c => c.name),
        components,
        estimatedPrice,
        image: preset.image, // <-- Thêm dòng này để trả về ảnh đại diện
        createdAt: preset.createdAt
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Thêm sản phẩm vào preset build
router.post('/presets/:presetId/products', async (req, res) => {
  try {
    const { presetId } = req.params;
    const { productId, quantity = 1 } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'ProductId không hợp lệ' });
    }

    const preset = PRESET_BUILDS.find(p => p.id === presetId);
    if (!preset) {
      return res.status(404).json({ error: 'Không tìm thấy preset build' });
    }

    // Kiểm tra sản phẩm có tồn tại
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    // Kiểm tra sản phẩm đã có trong preset chưa
    const existingIndex = preset.components.findIndex(c => c.productId === productId);
    if (existingIndex >= 0) {
      preset.components[existingIndex].quantity += quantity;
    } else {
      preset.components.push({ productId, quantity, name: product.name, price: product.price });
    }

    // Tính lại giá ước tính
    preset.estimatedPrice = preset.components.reduce((total, comp) => 
      total + (comp.price * comp.quantity), 0
    );

    res.json({ message: 'Đã thêm sản phẩm vào preset', preset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa sản phẩm khỏi preset build
router.delete('/presets/:presetId/products/:productId', (req, res) => {
  try {
    const { presetId, productId } = req.params;
    
    const preset = PRESET_BUILDS.find(p => p.id === presetId);
    if (!preset) {
      return res.status(404).json({ error: 'Không tìm thấy preset build' });
    }

    preset.components = preset.components.filter(c => c.productId !== productId);
    
    // Tính lại giá ước tính
    preset.estimatedPrice = preset.components.reduce((total, comp) => 
      total + (comp.price * comp.quantity), 0
    );

    res.json({ message: 'Đã xóa sản phẩm khỏi preset', preset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tạo build từ preset
router.post('/presets/:presetId/create-build', async (req, res) => {
  try {
    const { presetId } = req.params;
    const { userId, buildName } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'UserId không hợp lệ' });
    }

    const preset = PRESET_BUILDS.find(p => p.id === presetId);
    if (!preset || preset.components.length === 0) {
      return res.status(400).json({ error: 'Preset không tồn tại hoặc chưa có sản phẩm' });
    }

    // Tạo build mới
    const build = new Build({
      user_id: userId,
      name: buildName || preset.name,
      total_price: preset.estimatedPrice,
      status: 'draft'
    });
    await build.save();

    // Thêm sản phẩm vào build
    for (const component of preset.components) {
      await new BuildProduct({
        build_id: build._id,
        product_id: component.productId,
        quantity: component.quantity
      }).save();
    }

    res.status(201).json({ 
      message: 'Đã tạo build từ preset thành công', 
      buildId: build._id,
      totalPrice: preset.estimatedPrice
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tạo build mới
router.post('/build', async (req, res) => {
  try {
    const user_id = req.body.userId || req.body.user_id;
    const { name, products } = req.body;

    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: 'userId không hợp lệ (phải là ObjectId MongoDB)' });
    }

    if (!user_id || !products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Thiếu thông tin user hoặc sản phẩm.' });
    }

    const ids = products.map(p => p.productId);
    const productDocs = await Product.find({ _id: { $in: ids } }).lean();
    const items = productDocs.map(doc => {
      const qty = products.find(p => p.productId == doc._id.toString())?.quantity || 1;
      return { ...doc, quantity: qty };
    });
    const totalPrice = calculateTotalPrice(items);
    const performance = estimatePerformance(items);
    const compatibility = checkCompatibility(items);
    const build = new Build({ user_id, name, total_price: totalPrice, status: 'draft' });
    await build.save();
    for (const p of products) {
      await new BuildProduct({ build_id: build._id, product_id: p.productId, quantity: p.quantity }).save();
    }
    res.status(201).json({ buildId: build._id, totalPrice, performance, compatibility });
  } catch (err) {
    console.error('Lỗi khi tạo build:', err);
    res.status(500).json({ error: err.message });
  }
});

// Lấy tất cả build của user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'userId không hợp lệ.' });
    }
    const builds = await Build.find({ user_id: userId }).sort({ createdAt: -1 });
    res.json(builds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lấy chi tiết build theo id
router.get('/:buildId', async (req, res) => {
  try {
    const { buildId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(buildId)) {
      return res.status(400).json({ error: 'buildId không hợp lệ.' });
    }
    const build = await Build.findById(buildId);
    if (!build) return res.status(404).json({ error: 'Không tìm thấy build.' });

    // Lấy danh sách sản phẩm trong build
    const products = await BuildProduct.find({ build_id: buildId }).populate('product_id');
    res.json({ build, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa build
router.delete('/:buildId', async (req, res) => {
  try {
    const { buildId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(buildId)) {
      return res.status(400).json({ error: 'buildId không hợp lệ.' });
    }

    const build = await Build.findById(buildId);
    if (!build) {
      return res.status(404).json({ error: 'Không tìm thấy build.' });
    }

    // Kiểm tra quyền sở hữu
    if (build.user_id.toString() !== userId) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa build này.' });
    }

    // Xóa build products trước
    await BuildProduct.deleteMany({ build_id: buildId });
    // Xóa build
    await Build.findByIdAndDelete(buildId);

    res.json({ message: 'Đã xóa build thành công.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa nhiều builds
router.delete('/bulk/delete', async (req, res) => {
  try {
    const { buildIds, userId } = req.body;

    if (!Array.isArray(buildIds) || buildIds.length === 0) {
      return res.status(400).json({ error: 'Danh sách buildIds không hợp lệ.' });
    }

    // Kiểm tra tất cả buildIds hợp lệ
    const validIds = buildIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== buildIds.length) {
      return res.status(400).json({ error: 'Một số buildId không hợp lệ.' });
    }

    // Kiểm tra quyền sở hữu
    const builds = await Build.find({ _id: { $in: validIds }, user_id: userId });
    if (builds.length !== validIds.length) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa một số build.' });
    }

    // Xóa build products trước
    await BuildProduct.deleteMany({ build_id: { $in: validIds } });
    // Xóa builds
    await Build.deleteMany({ _id: { $in: validIds } });

    res.json({ message: `Đã xóa ${validIds.length} build thành công.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cập nhật build
router.put('/:buildId', async (req, res) => {
  try {
    const { buildId } = req.params;
    const { name, status, userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(buildId)) {
      return res.status(400).json({ error: 'buildId không hợp lệ.' });
    }

    const build = await Build.findById(buildId);
    if (!build) {
      return res.status(404).json({ error: 'Không tìm thấy build.' });
    }

    // Kiểm tra quyền sở hữu
    if (build.user_id.toString() !== userId) {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa build này.' });
    }

    // Cập nhật thông tin
    if (name) build.name = name;
    if (status) build.status = status;
    build.updatedAt = new Date();

    await build.save();
    res.json({ message: 'Đã cập nhật build thành công.', build });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tạo preset mới
router.post('/presets', async (req, res) => {
  try {
    const { name, description, category, image } = req.body; // nhận image
    if (!name || !category) {
      return res.status(400).json({ error: 'Thiếu tên hoặc danh mục.' });
    }
    const preset = new Preset({ name, description, category, image, comboIds: [] });
    await preset.save();
    res.status(201).json({ message: 'Đã tạo preset mới', preset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa preset
router.delete('/presets/:presetId', (req, res) => {
  try {
    const { presetId } = req.params;
    const idx = PRESET_BUILDS.findIndex(p => p.id === presetId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Không tìm thấy preset.' });
    }
    PRESET_BUILDS.splice(idx, 1);
    res.json({ message: 'Đã xóa preset thành công.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gán combo vào preset
router.post('/presets/:presetId/combo', async (req, res) => {
  try {
    const { presetId } = req.params;
    const { comboId } = req.body;
    const preset = await Preset.findById(presetId);
    if (!preset) return res.status(404).json({ error: 'Không tìm thấy preset' });
    if (!preset.comboIds.map(id => id.toString()).includes(comboId)) {
      preset.comboIds.push(comboId);
      await preset.save();
    }
    res.json({ message: 'Đã gán combo vào preset', preset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa combo khỏi preset
router.delete('/presets/:presetId/combo/:comboId', async (req, res) => {
  try {
    const { presetId, comboId } = req.params;
    const preset = await Preset.findById(presetId);
    if (!preset) return res.status(404).json({ error: 'Không tìm thấy preset' });
    preset.comboIds = preset.comboIds.filter(id => id.toString() !== comboId);
    await preset.save();
    res.json({ message: 'Đã xóa combo khỏi preset', preset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;