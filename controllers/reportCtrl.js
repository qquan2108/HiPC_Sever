// controllers/reportCtrl.js
const Order = require('../models/Order');  // đúng đường dẫn đến model

// 1. Tổng hợp doanh thu, số đơn, doanh thu trung bình
exports.getSummary = async (req, res) => {
  try {
    const [result] = await Order.aggregate([
      { 
        $match: { status: 'delivered' }        // chỉ tính đơn đã giao
      },
      { 
        $group: {
          _id: null,
          revenue:   { $sum: '$total' },       // tổng doanh thu
          orders:    { $sum: 1 }              // tổng số đơn
        }
      },
      {
        $addFields: {
          avgRevenue: {                       // doanh thu trung bình
            $cond: [
              { $gt: ['$orders', 0] },
              { $divide: ['$revenue', '$orders'] },
              0
            ]
          }
        }
      }
    ]);

    res.json(result || { revenue: 0, orders: 0, avgRevenue: 0 });
  } catch (err) {
    console.error('Error in getSummary:', err);
    res.status(500).json({ error: err.message });
  }
};

// 2. Doanh thu theo tháng
exports.getMonthlyRevenue = async (req, res) => {
  try {
    const agg = await Order.aggregate([
      { $match: { status: 'delivered' } },
      {
        $group: {
          _id: { $month: '$order_date' }, // gom theo tháng
          revenue: { $sum: '$total' }
        }
      }
    ]);

    const map = {};
    agg.forEach(m => { map[m._id] = m.revenue; });

    const labels = [];
    const data = [];
    for (let i = 1; i <= 12; i++) {
      labels.push(`Th${i}`);
      data.push(map[i] || 0);
    }

    res.json({ labels, data });
  } catch (err) {
    console.error('Error in getMonthlyRevenue:', err);
    res.status(500).json({ error: err.message });
  }
};

// 3. Doanh thu so sánh giữa các tháng chỉ định
exports.compareMonths = async (req, res) => {
  try {
    const monthsParam = req.query.months;
    if (!monthsParam) {
      return res.status(400).json({ error: 'months query required' });
    }

    const months = monthsParam
      .split(',')
      .map(m => parseInt(m, 10))
      .filter(m => m >= 1 && m <= 12);

    if (months.length === 0) {
      return res.status(400).json({ error: 'invalid months' });
    }

    const agg = await Order.aggregate([
      { $match: { status: 'delivered' } },
      {
        $project: {
          month: { $month: '$order_date' },
          total: '$total'
        }
      },
      { $match: { month: { $in: months } } },
      {
        $group: {
          _id: '$month',
          revenue: { $sum: '$total' }
        }
      }
    ]);

    const map = {};
    agg.forEach(m => { map[m._id] = m.revenue; });

    const labels = months.map(m => `Th${m}`);
    const data = months.map(m => map[m] || 0);

    res.json({ labels, data });
  } catch (err) {
    console.error('Error in compareMonths:', err);
    res.status(500).json({ error: err.message });
  }
};
