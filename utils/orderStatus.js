// Util chuyển trạng thái đơn hàng

// Định nghĩa các trạng thái chuyển tiếp hợp lệ
const transitions = {
  pending:           ['packed', 'cancelled'],         // Chờ xác nhận → Chờ lấy hàng, Hủy
  packed:            ['shipping', 'cancelled'],       // Chờ lấy hàng → Chờ giao hàng, Hủy
  shipping:          ['delivered', 'return_requested'], // Chờ giao hàng → Đã giao, Trả hàng
  delivered:         ['return_requested'],            // Đã giao → Trả hàng
  return_requested:  [],                              // Trả hàng (kết thúc)
  cancelled:         []                               // Đã hủy (kết thúc)
};

// Hàm kiểm tra chuyển trạng thái
function canTransition(from, to) {
  return Array.isArray(transitions[from]) && transitions[from].includes(to);
}

module.exports = { transitions, canTransition };