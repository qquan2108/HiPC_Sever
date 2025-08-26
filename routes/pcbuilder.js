const express = require('express');
const router = express.Router();
const Build = require('../models/Build');
const BuildProduct = require('../models/BuildProduct');
const Product = require('../models/Product');
const { calculateTotalPrice, estimatePerformance, checkCompatibility } = require('../utils/pcBuilders');
const mongoose = require('mongoose');
const Preset = require('../models/Preset');
const Combo = require('../models/Combo');
const Image = require('../models/Image');
const VariantProduct = require('../models/Variantproduct'); // Thêm nếu chưa có

// Preset builds với khả năng chỉnh sửa


// Lấy danh sách preset builds (MongoDB)
// Lấy tất cả combos
router.get('/combos', async (req, res) => {
  try {
    const combos = await Combo.find()
      .populate({
        path: 'productIds',
        populate: [
          { path: 'category_id', select: 'name' },
          { path: 'brand_id', select: 'name' }
        ]
      })
      .lean();

    // Lấy ảnh cho products trong combo (nếu cần)
    const allProductIds = combos.flatMap(combo =>
      combo.productIds.map(p => p._id.toString())
    );

    const images = await Image.find({
      product_id: { $in: allProductIds }
    }).lean();

    const imageMap = {};
    images.forEach(img => {
      if (!imageMap[img.product_id]) {
        imageMap[img.product_id] = img.url;
      }
    });

    const combosWithImages = combos.map(combo => ({
      ...combo,
      productIds: combo.productIds.map(p => ({
        ...p,
        image: imageMap[p._id.toString()] || ''
      }))
    }));

    res.json(combosWithImages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Lấy danh sách preset builds (MongoDB) - PHẦN CẦN SỬA
router.get('/presets', async (req, res) => {
  try {
    const presets = await Preset.find()
      .populate({
        path: 'comboIds',
        populate: {
          path: 'productIds',
          populate: [
            { path: 'category_id', select: 'name _id' },
            { path: 'brand_id', select: 'name' }
          ]
        }
      });

    const result = [];

    for (const preset of presets) {
      let componentsByCategory = {};
      let estimatedPrice = 0;

      for (const combo of preset.comboIds) {
        for (const product of combo.productIds) {
          if (!product.category_id) continue;
          const categoryId = product.category_id._id.toString();

          // Lấy tất cả biến thể của sản phẩm
          const variants = await VariantProduct.find({ product_id: product._id }).lean();

          // Nếu có biến thể, lấy biến thể đầu tiên làm mặc định
          let variant = undefined;
          if (variants.length > 0) {
            const v = variants[0];
            variant = {
              key: 'Phiên bản',
              label: v.name,
              _id: v._id,
              stock: v.stock,
              price: v.price
            };
          }

          // Nếu không có biến thể, lấy stock và price từ product
          const stock = variant ? variant.stock : (product.stock || 0);
          const price = variant ? variant.price : (product.price || 0);

          const productWithCategory = {
            _id: product._id,
            name: product.name,
            price,
            image: product.image,
            brand_id: product.brand_id,
            category_id: product.category_id,
            variant,
            stock,
            categoryName: product.category_id.name,
            variants // 🆕 Trả về toàn bộ danh sách biến thể cho UI chọn nếu cần
          };

          if (!componentsByCategory[categoryId]) {
            componentsByCategory[categoryId] = [];
          }
          componentsByCategory[categoryId].push(productWithCategory);

          estimatedPrice += price;
        }
      }

      const components = Object.entries(componentsByCategory).map(([categoryId, products]) => ({
        categoryId,
        categoryName: products[0].categoryName,
        products
      }));

      result.push({
        _id: preset._id,
        name: preset.name,
        description: preset.description,
        category: preset.category,
        components,
        estimatedPrice,
        price: estimatedPrice,
        image: preset.image,
        createdAt: preset.createdAt
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Error fetching presets:', err);
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

    const builds = await Build.find({ user_id: userId })
      .populate({
        path: 'products',
        populate: [
          {
            path: 'product_id',
            populate: [
              { path: 'category_id', select: 'name' },
              { path: 'brand_id', select: 'name' }
            ]
          },
          { path: 'variant._id', model: 'VariantProduct', select: 'name price stock' }
        ]
      })
      .populate({ path: 'user_id', select: 'full_name email' })
      .sort({ createdAt: -1 }); // đừng .lean() ở đây

    // Lấy productIds
    const productIds = builds.flatMap(b => b.products?.map(p => p.product_id?._id)).filter(Boolean);
    const [images, variants] = await Promise.all([
      Image.find({ product_id: { $in: productIds } }).lean(),
      VariantProduct.find({ product_id: { $in: productIds } }).lean()
    ]);

    const imageMap = {};
    images.forEach(i => { if (!imageMap[i.product_id]) imageMap[i.product_id] = i.url; });

    const variantMap = {};
    variants.forEach(v => {
      const key = v.product_id.toString();
      (variantMap[key] ||= []).push({ _id: v._id, name: v.name, price: v.price, stock: v.stock });
    });

    const processed = builds.map(b => {
      const total = (b.products || []).reduce((sum, line) => {
        const base = line?.product_id?.price || 0;
        const chosen = line?.variant?.price || 0;
        return sum + (chosen || base) * (line.quantity || 1);
      }, 0);

      const products = (b.products || []).map(line => {
        const pid = line?.product_id?._id?.toString();
        return {
          ...line.toObject?.() || line,
          product_id: {
            ...(line.product_id?.toObject?.() || line.product_id),
            image: imageMap[pid] || null,
            variants: variantMap[pid] || []
          }
        };
      });

      return {
        ...b.toObject?.() || b,
        products,
        total_price: total || b.total_price || 0,
        createdAt: b.createdAt || b.created_at, // chuẩn hoá cho client
      };
    });

    res.json({ builds: processed, total: processed.length, message: 'Lấy danh sách build thành công' });
  } catch (err) {
    console.error('Error fetching builds:', err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách build', message: err.message });
  }
});

// Lấy chi tiết build theo id
router.get('/:buildId', async (req, res) => {
  try {
    const { buildId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(buildId)) {
      return res.status(400).json({ error: 'buildId không hợp lệ.' });
    }

    const build = await Build.findById(buildId)
      .populate({
        path: 'products',
        populate: [
          {
            path: 'product_id',
            populate: [
              { path: 'category_id', select: 'name' },
              { path: 'brand_id', select: 'name' }
            ]
          },
          { path: 'variant._id', model: 'VariantProduct', select: 'name price stock' }
        ]
      });

    if (!build) return res.status(404).json({ error: 'Không tìm thấy build.' });

    // Ảnh sản phẩm
    const productIds = build.products?.map(p => p.product_id?._id).filter(Boolean);
    const images = await Image.find({ product_id: { $in: productIds } }).lean();

    const imageMap = {};
    images.forEach(img => { 
      if (img && img.product_id) {
        imageMap[img.product_id.toString()] = img.url;
      }
    });

    const buildObj = build.toObject();
    const processed = {
      ...buildObj,
      products: buildObj.products?.map(line => {
        if (!line || !line.product_id) return line;

        const productId = line.product_id._id?.toString();
        return {
          ...line,
          product_id: {
            ...line.product_id,
            image: imageMap[productId] || null
          }
        };
      }).filter(Boolean) // Remove any null/undefined entries
    };

    res.json(processed);
  } catch (err) {
    console.error('Error fetching build details:', err);
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