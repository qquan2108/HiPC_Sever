const express = require('express');
const router = express.Router();
const Voucher = require('../models/Voucher');

// Validation middleware
const validateVoucherData = (req, res, next) => {
  const { code, discount_value, discount_type, apply_for } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Mã voucher là bắt buộc' });
  }

  if (!discount_value || discount_value <= 0) {
    return res.status(400).json({ error: 'Giá trị giảm giá phải lớn hơn 0' });
  }

  if (!['percentage', 'fixed'].includes(discount_type)) {
    return res.status(400).json({ error: 'Loại giảm giá phải là percentage hoặc fixed' });
  }

  if (discount_type === 'percentage' && discount_value > 100) {
    return res.status(400).json({ error: 'Phần trăm giảm giá không được vượt quá 100%' });
  }

  // Validate apply_for
  if (!['order', 'shipping'].includes(apply_for)) {
    return res.status(400).json({ error: 'Trường apply_for phải là order hoặc shipping' });
  }

  next();
};

// GET all vouchers with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      status = 'all', // all, active, inactive, expired
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'desc',
      search = ''
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    let filterQuery = {};
    const now = new Date();

    if (req.query.apply_for && ['order', 'shipping'].includes(req.query.apply_for)) {
      filterQuery.apply_for = req.query.apply_for;
    }

    // Search by code or description
    if (search) {
      filterQuery.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    switch (status) {
      case 'active':
        filterQuery.$and = [
          { quantity: { $gt: 0 } },
          { $or: [{ start_date: { $exists: false } }, { start_date: { $lte: now } }] },
          { $or: [{ end_date: { $exists: false } }, { end_date: { $gte: now } }] }
        ];
        break;
      case 'inactive':
        filterQuery.quantity = 0;
        break;
      case 'expired':
        filterQuery.end_date = { $lt: now };
        break;
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const vouchers = await Voucher.find(filterQuery)
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    const total = await Voucher.countDocuments(filterQuery);

    // Add status information to each voucher
    const vouchersWithStatus = vouchers.map(voucher => {
      const voucherObj = voucher.toObject();
      voucherObj.status = getVoucherStatus(voucherObj, now);
      return voucherObj;
    });

    res.json({
      vouchers: vouchersWithStatus,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET active vouchers only (for frontend display)
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const vouchers = await Voucher.find({
      quantity: { $gt: 0 },
      $or: [{ start_date: { $exists: false } }, { start_date: { $lte: now } }],
      $and: [{ $or: [{ end_date: { $exists: false } }, { end_date: { $gte: now } }] }]
    }).sort({ created_at: -1 });

    const vouchersWithStatus = vouchers.map(voucher => {
      const voucherObj = voucher.toObject();
      voucherObj.status = getVoucherStatus(voucherObj, now);
      return voucherObj;
    });

    res.json(vouchersWithStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET voucher by ID
router.get('/:id', async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) return res.status(404).json({ error: 'Voucher không tồn tại' });
    
    const voucherObj = voucher.toObject();
    voucherObj.status = getVoucherStatus(voucherObj);
    
    res.json(voucherObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET voucher by code
router.get('/code/:code', async (req, res) => {
  try {
    const voucher = await Voucher.findOne({ code: req.params.code.toUpperCase() });
    if (!voucher) return res.status(404).json({ error: 'Voucher không tồn tại' });
    
    const voucherObj = voucher.toObject();
    voucherObj.status = getVoucherStatus(voucherObj);
    
    res.json(voucherObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔍 DEBUG ROUTE - Add this to inspect voucher data
router.get('/debug/:code', async (req, res) => {
  try {
    const voucher = await Voucher.findOne({ code: req.params.code.toUpperCase() });
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }
    
    // Return raw voucher data for debugging
    res.json({
      raw: voucher,
      processed: {
        discount_type: voucher.discount_type,
        discount_value: Number(voucher.discount_value),
        discount_value_type: typeof voucher.discount_value,
        max_discount: voucher.max_discount,
        max_discount_type: typeof voucher.max_discount
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create voucher
router.post('/', validateVoucherData, async (req, res) => {
  try {
    // Check if voucher code already exists
    const existingVoucher = await Voucher.findOne({ code: req.body.code.toUpperCase() });
    if (existingVoucher) {
      return res.status(400).json({ error: 'Mã voucher đã tồn tại' });
    }

    // Chuẩn hóa dữ liệu đầu vào
    const voucherData = {
      code: req.body.code.toUpperCase(),
      discount_type: req.body.discount_type,
      discount_value: Number(req.body.discount_value),
      min_order_amount: req.body.min_order_amount ? Number(req.body.min_order_amount) : 0,
      max_discount: req.body.max_discount ? Number(req.body.max_discount) : undefined,
      quantity: req.body.quantity ? Number(req.body.quantity) : 1,
      description: req.body.description || '',
      title: req.body.title || '',
      start_date: req.body.start_date ? new Date(req.body.start_date) : undefined,
      end_date: req.body.end_date ? new Date(req.body.end_date) : undefined,
      apply_for: req.body.apply_for, // Thêm dòng này
      created_at: new Date(),
      updated_at: new Date()
    };

    // Xóa các trường undefined để tránh lỗi schema
    Object.keys(voucherData).forEach(
      key => voucherData[key] === undefined && delete voucherData[key]
    );

    const newVoucher = new Voucher(voucherData);
    await newVoucher.save();

    res.status(201).json({
      message: 'Tạo voucher thành công',
      voucher: newVoucher
    });
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ error: 'Mã voucher đã tồn tại' });
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

// PUT update voucher
router.put('/:id', async (req, res) => {
  try {
    // If updating code, check for duplicates
    if (req.body.code) {
      const existingVoucher = await Voucher.findOne({ 
        code: req.body.code.toUpperCase(),
        _id: { $ne: req.params.id }
      });
      if (existingVoucher) {
        return res.status(400).json({ error: 'Mã voucher đã tồn tại' });
      }
      req.body.code = req.body.code.toUpperCase();
    }

    req.body.updated_at = new Date();
    
    const updated = await Voucher.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Voucher không tồn tại' });
    }
    
    res.json({
      message: 'Cập nhật voucher thành công',
      voucher: updated
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE voucher
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Voucher.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Voucher không tồn tại' });
    }
    res.json({ message: 'Xóa voucher thành công' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST: Validate voucher (check if can be applied without actually applying)
router.post('/validate', async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    
    if (!code || typeof orderAmount !== 'number') {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    const voucher = await Voucher.findOne({ code: code.toUpperCase() });
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher không tồn tại' });
    }

    const validation = validateVoucherConditions(voucher, orderAmount);
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    // Calculate discount
    const discountAmount = calculateDiscountAmount(voucher, orderAmount);
    
    res.json({
      valid: true,
      voucher: voucher,
      discount: discountAmount,
      finalAmount: Math.max(0, orderAmount - discountAmount)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Apply voucher
router.post('/apply', async (req, res) => {
  try {
    const { code, orderAmount, userId } = req.body;
    
    if (!code || typeof orderAmount !== 'number') {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    const voucher = await Voucher.findOne({ code: code.toUpperCase() });
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher không tồn tại' });
    }
    if (req.body.apply_for && voucher.apply_for !== req.body.apply_for) {
      return res.status(400).json({ error: 'Voucher không áp dụng cho loại này' });
    }

    const validation = validateVoucherConditions(voucher, orderAmount);
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    // Calculate discount
    const discountAmount = calculateDiscountAmount(voucher, orderAmount);
    
    // Decrease voucher quantity
    voucher.quantity -= 1;
    voucher.used_count = (voucher.used_count || 0) + 1;
    voucher.updated_at = new Date();
    
    await voucher.save();

    res.json({
      success: true,
      message: 'Áp dụng voucher thành công',
      voucher: voucher,
      discount: discountAmount,
      finalAmount: Math.max(0, orderAmount - discountAmount)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Bulk create vouchers
router.post('/bulk', async (req, res) => {
  try {
    const { vouchers } = req.body;
    
    if (!Array.isArray(vouchers) || vouchers.length === 0) {
      return res.status(400).json({ error: 'Danh sách voucher không hợp lệ' });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < vouchers.length; i++) {
      try {
        const voucherData = {
          ...vouchers[i],
          code: vouchers[i].code.toUpperCase(),
          created_at: new Date(),
          updated_at: new Date()
        };
        
        const newVoucher = new Voucher(voucherData);
        await newVoucher.save();
        results.push(newVoucher);
      } catch (err) {
        errors.push({
          index: i,
          code: vouchers[i].code,
          error: err.message
        });
      }
    }

    res.json({
      success: results.length,
      errors: errors.length,
      created: results,
      failed: errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET voucher statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const now = new Date();
    
    const [total, active, expired, outOfStock, totalUsed] = await Promise.all([
      // total vouchers
      Voucher.countDocuments({}),
      // active vouchers
      Voucher.countDocuments({
        quantity: { $gt: 0 },
        $and: [
          { $or: [{ start_date: { $exists: false } }, { start_date: { $lte: now } }] },
          { $or: [{ end_date: { $exists: false } }, { end_date: { $gte: now } }] }
        ]
      }),
      // expired vouchers
      Voucher.countDocuments({ end_date: { $lt: now } }),
      // out of stock vouchers
      Voucher.countDocuments({ quantity: { $lte: 0 } }),
      // total used (sum)
      Voucher.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$used_count", 0] } } } }]),
    ]);

    // expiring soon (next X days)
    const days = Number(req.query.days || 7);
    const soon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const expiringSoon = await Voucher.countDocuments({
      end_date: { $gte: now, $lte: soon },
      quantity: { $gt: 0 }
    });

    res.json({
      totals: {
        total,
        active,
        expired,
        outOfStock
      },
      usage: {
        totalUsed: Array.isArray(totalUsed) && totalUsed[0] ? totalUsed[0].total : 0
      },
      expiringSoon: {
        count: expiringSoon,
        withinDays: days
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Top vouchers by usage
router.get('/stats/top', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 5);
    const top = await Voucher.find({})
      .sort({ used_count: -1 })
      .limit(limit);

    res.json({ top, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Vouchers expiring soon (list)
router.get('/stats/expiring', async (req, res) => {
  try {
    const now = new Date();
    const days = Number(req.query.days || 7);
    const soon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const vouchers = await Voucher.find({
      end_date: { $gte: now, $lte: soon },
    }).sort({ end_date: 1 });

    res.json({
      withinDays: days,
      count: vouchers.length,
      vouchers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------- Helper Functions -------------------------- */

function getVoucherStatus(voucher, now = new Date()) {
  if (voucher.quantity <= 0) return 'out_of_stock';
  if (voucher.start_date && now < new Date(voucher.start_date)) return 'not_started';
  if (voucher.end_date && now > new Date(voucher.end_date)) return 'expired';
  return 'active';
}

function validateVoucherConditions(voucher, orderAmount) {
  const now = new Date();

  if (voucher.quantity <= 0) {
    return { valid: false, message: 'Voucher đã hết lượt sử dụng' };
  }

  if (voucher.start_date && now < new Date(voucher.start_date)) {
    return { valid: false, message: 'Voucher chưa bắt đầu' };
  }

  if (voucher.end_date && now > new Date(voucher.end_date)) {
    return { valid: false, message: 'Voucher đã hết hạn' };
  }

  const minOrder = voucher.min_order_amount ?? voucher.min_order_value ?? 0;
  if (orderAmount < minOrder) {
    const lacking = (minOrder - orderAmount).toLocaleString('vi-VN');
    return { valid: false, message: `Đơn hàng chưa đạt tối thiểu, thiếu ${lacking}đ` };
  }

  return { valid: true, message: 'Hợp lệ' };
}

// ✅ FIXED calculateDiscountAmount function with proper debugging
function calculateDiscountAmount(voucher, orderAmount) {
  let discount = 0;

  // Add debugging logs
  console.log('🔍 Voucher calculation debug:', {
    voucherCode: voucher.code,
    discountType: voucher.discount_type,
    discountValue: voucher.discount_value,
    discountValueType: typeof voucher.discount_value,
    maxDiscount: voucher.max_discount,
    orderAmount: orderAmount
  });

  if (voucher.discount_type === 'percentage') {
    // ✅ Ensure it's a number
    const pct = Number(voucher.discount_value) || 0;
    discount = (orderAmount * pct) / 100;
    
    console.log('📊 Percentage calculation:', {
      percentage: pct,
      calculation: `${orderAmount} * ${pct} / 100`,
      result: discount
    });

    // Apply max discount limit if exists
    if (typeof voucher.max_discount === 'number' && voucher.max_discount > 0) {
      const originalDiscount = discount;
      discount = Math.min(discount, voucher.max_discount);
      
      if (originalDiscount !== discount) {
        console.log('🔒 Max discount applied:', {
          original: originalDiscount,
          maxLimit: voucher.max_discount,
          final: discount
        });
      }
    }
  } else if (voucher.discount_type === 'fixed') {
    // ✅ Ensure it's a number
    discount = Number(voucher.discount_value) || 0;
    
    console.log('💰 Fixed discount:', {
      fixedAmount: discount
    });
  }

  // Prevent negative final amount
  const finalDiscount = Math.max(0, Math.min(discount, orderAmount));
  
  console.log('✅ Final discount result:', {
    calculatedDiscount: discount,
    finalDiscount: finalDiscount,
    orderAmount: orderAmount,
    afterDiscount: orderAmount - finalDiscount
  });

  return finalDiscount;
}

module.exports = router;