// Util chuyển trạng thái đơn hàng

// Định nghĩa các trạng thái chuyển tiếp hợp lệ
const transitions = {
  pending:           ['confirmed', 'cancelled', 'failed'],
  confirmed:         ['packed', 'cancelled', 'failed'],
  packed:            ['picked', 'cancelled', 'failed'],
  picked:            ['shipping', 'cancelled', 'failed'],
  shipping:          ['delivered', 'return_requested', 'failed'],
  delivered:         ['return_requested'],
  return_requested:  ['return_approved', 'refunding', 'failed'],
  return_approved:   ['refunding', 'failed'],
  refunding:         ['refunded', 'failed'],
  refunded:          [],
  cancelled:         [],
  failed:            []
};

// Hàm kiểm tra chuyển trạng thái
function canTransition(from, to) {
  return Array.isArray(transitions[from]) && transitions[from].includes(to);
}

module.exports = { transitions, canTransition };