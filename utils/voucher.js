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

function calculateDiscountAmount(voucher, orderAmount) {
  let discount = 0;

  if (voucher.discount_type === 'percentage') {
    const pct = voucher.discount_value || 0;
    discount = (orderAmount * pct) / 100;

    if (typeof voucher.max_discount === 'number') {
      discount = Math.min(discount, voucher.max_discount);
    }
  } else {
    // fixed amount
    discount = voucher.discount_value || 0;
  }

  // prevent negative final amount
  discount = Math.max(0, Math.min(discount, orderAmount));
  return discount;
}

module.exports = {
  getVoucherStatus,
  validateVoucherConditions,
  calculateDiscountAmount
};