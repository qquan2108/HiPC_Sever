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
    const monthly = await Order.aggregate([
      { 
        $match: { status: 'delivered' }
      },
      {
        $group: {
          _id: { $month: '$order_date' },     // gom theo tháng
          revenue: { $sum: '$total' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    const labels = monthly.map(m => `Th${m._id}`);
    const data   = monthly.map(m => m.revenue);

    res.json({ labels, data });
  } catch (err) {
    console.error('Error in getMonthlyRevenue:', err);
    res.status(500).json({ error: err.message });
  }
};
