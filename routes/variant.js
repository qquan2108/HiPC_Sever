const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const VariantProduct = require('../models/Variantproduct');
const Product = require('../models/Product');
const Category = require('../models/Category');

// ---------- Helpers ----------
const normalizeSlug = (s = '') =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, '-');

function parseNameToStructuredFields(name = '') {
  const raw = String(name).trim();
  let groupKey = null, optionLabel = raw, optionSlug = normalizeSlug(raw);

  const pairs = [
    [/^Chipset\s+/i, 'Chipset'],
    [/^Form Factor\s+/i, 'Form Factor'],
    [/^(?:Socket|SoC)\s+/i, 'Socket/SoC'],
    [/^Dung lượng\s+/i, 'Dung lượng'],
    [/^Memory\s+/i, 'Memory'],
    [/^Wattage\s+/i, 'Wattage'],
    [/^Modular\s+/i, 'Modular'],
    [/^Side Panel\s+/i, 'Side Panel'],
    [/^Phiên Bản\s+/i, 'Phiên bản'],
    [/^Bảo Hành\s+/i, 'Bảo hành'],
  ];

  for (const [re, key] of pairs) {
    if (re.test(raw)) {
      groupKey = key;
      optionLabel = raw.replace(re, '').trim();
      optionSlug = normalizeSlug(optionLabel);
      break;
    }
  }
  return { groupKey, optionLabel, optionSlug };
}

// ---------- /variants/grouped ----------
router.get('/grouped', async (req, res) => {
  try {
    const { categoryId, q, limitPerGroup } = req.query;
    const limitN = Math.max(1, Math.min(100, Number(limitPerGroup) || 50));

    const $match = {
      isActive: { $ne: false },                  // chỉ lấy active
      groupKey: { $exists: true, $ne: null },
      optionSlug: { $exists: true, $ne: null },
    };

    if (q && String(q).trim()) {
      // tìm theo optionLabel (regex) — có index optionSlug thì tốt hơn
      $match.$or = [
        { optionLabel: { $regex: String(q).trim(), $options: 'i' } },
        { optionSlug: { $regex: normalizeSlug(String(q)), $options: 'i' } }
      ];
    }

    const pipeline = [
      { $match }, // match thật sớm
      {
        $lookup: {
          from: 'products',
          localField: 'product_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
    ];

    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      pipeline.push({
        $match: { 'product.category_id': new mongoose.Types.ObjectId(categoryId) }
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          product_id: 1,
          groupKey: 1,
          optionLabel: 1,
          optionSlug: 1,
          sortOrder: 1,
          categoryId: '$category._id',
          categoryName: '$category.name'
        }
      },
      // gom option theo category + groupKey + optionSlug
      {
        $group: {
          _id: {
            categoryId: '$categoryId',
            categoryName: '$categoryName',
            groupKey: '$groupKey',
            optionSlug: '$optionSlug',
            optionLabel: '$optionLabel',
          },
          variantIds: { $addToSet: '$_id' },
          productIds: { $addToSet: '$product_id' },
          count: { $sum: 1 },
          // Nếu muốn lấy min sortOrder để sắp xếp option, có thể thêm $min ở đây
        }
      },
      // gom tiếp theo groupKey
      {
        $group: {
          _id: { categoryId: '$_id.categoryId', categoryName: '$_id.categoryName', groupKey: '$_id.groupKey' },
          options: {
            $push: {
              label: '$_id.optionLabel',
              slug: '$_id.optionSlug',
              variantIds: '$variantIds',
              productIds: '$productIds',
              count: '$count'
            }
          }
        }
      },
      // (optional) cắt bớt options mỗi group cho gọn UI
      {
        $project: {
          _id: 1,
          options: {
            $slice: [
              {
                $sortArray: {
                  input: '$options',
                  sortBy: { label: 1 } // sort label tăng dần (nếu có sortOrder ở option, có thể dùng trước)
                }
              },
              limitN
            ]
          }
        }
      },
      // gom theo category
      {
        $group: {
          _id: { categoryId: '$_id.categoryId', categoryName: '$_id.categoryName' },
          items: {
            $push: {
              key: '$_id.groupKey',
              options: '$options'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          categoryId: '$_id.categoryId',
          categoryName: '$_id.categoryName',
          items: 1
        }
      }
    );

    const rows = await VariantProduct.aggregate(pipeline);

    // sắp xếp hiển thị
    const keyPriority = [
      'Chipset','Form Factor','Socket/SoC',
      'Phiên bản','Bảo hành',
      'Dung lượng RAM','Dung lượng','Memory','Kiểu Module','Form Factor (Storage)',
      'Wattage','Modular','Side Panel'
    ];
    for (const g of rows) {
      g.items.sort((a,b) => {
        const ia = keyPriority.indexOf(a.key), ib = keyPriority.indexOf(b.key);
        if (ia === -1 && ib === -1) return a.key.localeCompare(b.key, 'vi');
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
      for (const item of g.items) {
        item.options.sort((a,b) => a.label.localeCompare(b.label, 'vi'));
      }
    }

    res.json({ groups: rows });
  } catch (err) {
    console.error('GET /variants/grouped error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- CREATE ----------
router.post('/create', async (req, res) => {
  try {
    const { product_id, name, price, stock, groupKey, optionLabel, optionSlug, isActive, sortOrder } = req.body;

    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ error: 'product_id không hợp lệ' });
    }

    // auto-fill nếu FE chưa gửi các trường mới
    let gk = groupKey, ol = optionLabel, os = optionSlug;
    if (!gk || !ol || !os) {
      const parsed = parseNameToStructuredFields(name);
      gk = gk || parsed.groupKey;
      ol = ol || parsed.optionLabel;
      os = os || parsed.optionSlug;
    }

    const variant = new VariantProduct({
      product_id,
      name,
      price,
      stock,
      groupKey: gk,
      optionLabel: ol,
      optionSlug: os,
      isActive: isActive !== undefined ? !!isActive : true,
      sortOrder: Number(sortOrder) || 0
    });

    await variant.save();
    res.status(201).json({ message: 'Tạo biến thể thành công', variant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- READ ALL ----------
router.get('/', async (req, res) => {
  try {
    const variants = await VariantProduct.find()
      .populate('product_id', 'name')
      .lean();
    res.json(variants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- BY PRODUCT ----------
router.get('/by-product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'productId không hợp lệ' });
    }
    const variants = await VariantProduct.find({ product_id: productId })
      .populate('product_id', 'name')
      .lean();
    res.json(variants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- READ ONE ----------
router.get('/:id', async (req, res) => {
  try {
    const variant = await VariantProduct.findById(req.params.id);
    if (!variant) return res.status(404).json({ error: 'Không tìm thấy biến thể' });
    res.json(variant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- UPDATE ----------
router.put('/:id', async (req, res) => {
  try {
    const { name, price, stock, product_id, groupKey, optionLabel, optionSlug, isActive, sortOrder } = req.body;

    const update = { };
    if (name !== undefined) update.name = name;
    if (price !== undefined) update.price = price;
    if (stock !== undefined) update.stock = stock;
    if (isActive !== undefined) update.isActive = !!isActive;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;

    if (product_id && mongoose.Types.ObjectId.isValid(product_id)) {
      update.product_id = product_id;
    }

    // nếu FE không gửi groupKey/optionLabel/optionSlug thì parse từ name (nếu có)
    if (groupKey || optionLabel || optionSlug || name) {
      const parsed = parseNameToStructuredFields(update.name);
      update.groupKey   = groupKey   ?? parsed.groupKey;
      update.optionLabel= optionLabel?? parsed.optionLabel;
      update.optionSlug = optionSlug ?? parsed.optionSlug;
    }

    const variant = await VariantProduct.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!variant) return res.status(404).json({ error: 'Không tìm thấy biến thể' });
    res.json({ message: 'Cập nhật thành công', variant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- DELETE ----------
router.delete('/:id', async (req, res) => {
  try {
    const variant = await VariantProduct.findByIdAndDelete(req.params.id);
    if (!variant) return res.status(404).json({ error: 'Không tìm thấy biến thể' });
    res.json({ message: 'Đã xóa biến thể' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
