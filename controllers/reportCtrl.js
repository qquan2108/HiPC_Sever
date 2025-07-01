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

// ===== Doanh thu tuỳ chọn theo ngày/tuần/tháng =====
function isoWeekStart(year, week) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = new Date(simple);
  if (dow <= 4) ISOweekStart.setDate(simple.getDate() - dow + 1);
  else ISOweekStart.setDate(simple.getDate() + 8 - dow);
  ISOweekStart.setHours(0,0,0,0);
  return ISOweekStart;
}

exports.getRevenue = async (req, res) => {
  try {
    const period = req.query.period || 'month';
    const match = { status: 'delivered' };
    let labels = [], data = [], groupExpr;

    if (period === 'week') {
      const weekStr = req.query.week;
      if (!weekStr) return res.status(400).json({ error: 'week required' });
      const [y, w] = weekStr.split('-W').map(Number);
      const start = isoWeekStart(y, w);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      match.order_date = { $gte: start, $lt: end };
      groupExpr = { $dayOfWeek: '$order_date' };
      labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      data = Array(7).fill(0);
    } else if (period === 'month') {
      const monthStr = req.query.month;
      if (!monthStr) return res.status(400).json({ error: 'month required' });
      const [y, m] = monthStr.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      match.order_date = { $gte: start, $lt: end };
      const days = new Date(y, m, 0).getDate();
      groupExpr = { $dayOfMonth: '$order_date' };
      labels = Array.from({ length: days }, (_, i) => String(i + 1));
      data = Array(days).fill(0);
    } else {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      match.order_date = { $gte: start, $lt: end };
      groupExpr = { $month: '$order_date' };
      labels = Array.from({ length: 12 }, (_, i) => `Th${i + 1}`);
      data = Array(12).fill(0);
    }

    const agg = await Order.aggregate([
      { $match: match },
      { $group: { _id: groupExpr, revenue: { $sum: '$total' } } }
    ]);

    agg.forEach(r => {
      const idx = (period === 'week' ? r._id - 1 : r._id - 1);
      if (data[idx] != null) data[idx] = r.revenue;
    });

    res.json({ labels, data });
  } catch (err) {
    console.error('Error in getRevenue:', err);
    res.status(500).json({ error: err.message });
  }
};
