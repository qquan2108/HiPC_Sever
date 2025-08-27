const Order = require("../models/Order");
const mongoose = require('mongoose');
const Product = require("../models/Product");
const Image = require("../models/Image");
const Cart = require("../models/Cart");
const Voucher = require("../models/Voucher");
const Combo = require("../models/Combo");
const VariantProduct = require('../models/Variantproduct'); // Thêm dòng này ở đầu file nếu chưa có
const {
  validateVoucherConditions,
  calculateDiscountAmount,
} = require("../utils/voucher");
const { canTransition } = require("../utils/orderStatus");
const Notification = require("../models/Notification");
const { sendMail } = require("../utils/mailer");

// Hoàn tồn kho cho 1 line sản phẩm (có thể là line của order.products
// hoặc 1 sản phẩm bên trong combo.products)
async function restoreStockForLine(line, qtyMultiplier = 1, session = null) {
  const quantity = Math.max(1, Number(line.quantity || 1)) * Math.max(1, Number(qtyMultiplier || 1));

  // Nếu line là kiểu { productId, quantity, variant? }
  // (đúng structure của order.products[])
  const productId = line.productId?._id || line.productId || line?.product?._id || line?.product;
  const variantId = line?.variant?._id || line?.variantId || null;

  if (variantId) {
    // Hoàn kho cho biến thể
    await VariantProduct.updateOne(
      { _id: variantId },
      { $inc: { stock: quantity } },
      session ? { session } : {}
    );
  } else if (productId) {
    // Hoàn kho cho sản phẩm gốc
    await Product.updateOne(
      { _id: productId },
      { $inc: { stock: quantity } },
      session ? { session } : {}
    );
  }
}

// Hoàn tồn kho cho toàn bộ đơn
async function restoreStockForOrder(order, session = null) {
  // Hoàn kho cho các sản phẩm lẻ
  if (Array.isArray(order.products)) {
    for (const p of order.products) {
      await restoreStockForLine(p, 1, session);
    }
  }

  // Hoàn kho cho combo
  if (Array.isArray(order.combos)) {
    for (const c of order.combos) {
      const qtyCombo = Math.max(1, Number(c.quantity || 1)); // mỗi combo gồm nhiều sp
      if (Array.isArray(c.products)) {
        for (const cp of c.products) {
          // cp có dạng { productId, variant? }, cần nhân với số lượng combo
          await restoreStockForLine(cp, qtyCombo, session);
        }
      } else if (Array.isArray(c.comboDetails?.products)) {
        // Fallback nếu bạn đã gắn products trong comboDetails
        for (const cp of c.comboDetails.products) {
          await restoreStockForLine(cp, qtyCombo, session);
        }
      }
    }
  }
}


//thong bao
const createOrderNotification = async (order, status) => {
  let title, message, type;

  switch (status) {
    case "pending":
      title = "Đơn hàng mới";
      message = `Đơn hàng #${order._id} đã được tạo và đang chờ xử lý`;
      type = "info";
      break;
    case "confirmed":
      title = "Đơn hàng đã xác nhận";
      message = `Đơn hàng #${order._id} đã được xác nhận`;
      type = "info";
      break;
    case "packed":
      title = "Đơn hàng đã đóng gói";
      message = `Đơn hàng #${order._id} đã được đóng gói và chuẩn bị vận chuyển`;
      type = "info";
      break;
    case "shipping":
      title = "Đơn hàng đang vận chuyển";
      message = `Đơn hàng #${order._id} đang trên đường giao đến bạn`;
      type = "info";
      break;
    case "delivered":
      title = "Đơn hàng đã giao thành công";
      message = `Đơn hàng #${order._id} đã được giao thành công`;
      type = "success";
      break;
    case "cancelled":
      title = "Đơn hàng đã hủy";
      message = `Đơn hàng #${order._id} đã được hủy`;
      type = "danger";
      break;
    default:
      return;
  }

  await Notification.create({
    type,
    title,
    message,
    user_id: order.user_id,
    // Bạn có thể thêm userId nếu cần gửi thông báo cho user cụ thể
  });
};

// Gửi email cho người dùng khi tạo đơn hoặc giao thành công
const sendOrderEmail = async (orderId, type) => {
  try {
    const order = await Order.findById(orderId)
      .populate({
        path: "user_id",
        select: "full_name email phone"
      })
      .populate({
        path: "products.productId",
        populate: [
          { path: "category_id", select: "name" },
          { path: "brand_id", select: "name" }
        ]
      })
      .lean();

    if (!order || !order.user_id) return;

    // Format currency helper
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND"
      }).format(amount);
    };

    // Format date helper
    const formatDate = (date) => {
      return new Date(date).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // Generate product rows
    const rows = order.products.map(item => {
      const prod = item.productId;
      const variant = item.variant;
      const itemPrice = variant?.price || prod.price;
      const itemTotal = itemPrice * item.quantity;

      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 15px 10px; vertical-align: top;">
            <div style="font-weight: 600; color: #333; margin-bottom: 5px;">
              ${prod.name}
            </div>
            ${variant ? `
              <div style="color: #666; font-size: 13px;">
                ${variant.key}: ${variant.label}
              </div>
            ` : ''}
            <div style="color: #666; font-size: 12px; margin-top: 3px;">
              Danh mục: ${prod.category_id?.name || ''}
              ${prod.brand_id ? `• Thương hiệu: ${prod.brand_id.name}` : ''}
            </div>
          </td>
          <td style="padding: 15px 10px; text-align: center;">
            <img 
              src="${prod.image || ''}" 
              width="60" height="60" 
              style="object-fit: cover; border-radius: 8px; border: 1px solid #eee;"
              alt="${prod.name}"
            />
          </td>
          <td style="padding: 15px 10px; text-align: center; font-weight: 600; color: #2563eb;">
            ${item.quantity}
          </td>
          <td style="padding: 15px 10px; text-align: right; font-weight: 600;">
            ${formatCurrency(itemPrice)}
          </td>
          <td style="padding: 15px 10px; text-align: right; font-weight: 700; color: #dc2626;">
            ${formatCurrency(itemTotal)}
          </td>
        </tr>
      `;
    }).join('');

    // Email template
    const html = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thông tin đơn hàng #${order._id.toString().slice(-8)}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 2px;">
              HiPC
            </h1>
            <p style="color: #bfdbfe; margin: 5px 0 0 0; font-size: 14px;">
              Thiết bị vi tính chất lượng cao
            </p>
          </div>

          <!-- Order Status -->
          <div style="background-color: ${order.status === 'cancelled' ? '#fee2e2' : '#f0fdf4'}; padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0; color: ${order.status === 'cancelled' ? '#dc2626' : '#059669'}; font-weight: 600; text-align: center;">
              ${order.status === 'cancelled' ? '🚫 Đơn hàng đã bị hủy' : '✅ Đơn hàng đang được xử lý'}
            </p>
          </div>

          <!-- Main Content -->
          <div style="padding: 30px 20px;">
            <!-- Order Info -->
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #2563eb;">
              <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">
                📋 Thông tin đơn hàng
              </h3>
              <div style="display: grid; gap: 8px;">
                <p style="margin: 0; color: #374151;">
                  <strong>Mã đơn hàng:</strong> #${order._id.toString().slice(-8)}
                </p>
                <p style="margin: 0; color: #374151;">
                  <strong>Ngày đặt:</strong> ${formatDate(order.createdAt)}
                </p>
                <p style="margin: 0; color: #374151;">
                  <strong>Khách hàng:</strong> ${order.user_id.full_name}
                </p>
                <p style="margin: 0; color: #374151;">
                  <strong>Số điện thoại:</strong> ${order.user_id.phone}
                </p>
                <p style="margin: 0; color: #374151;">
                  <strong>Email:</strong> ${order.user_id.email}
                </p>
                <p style="margin: 0; color: #374151;">
                  <strong>Địa chỉ:</strong> ${order.address}
                </p>
                <p style="margin: 0; color: #374151;">
                  <strong>Phương thức thanh toán:</strong> ${order.paymentMethod === 'cod' ? 'Thanh toán khi nhận hàng' : order.paymentMethod}
                </p>
              </div>
            </div>

            <!-- Products Table -->
            <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; margin-bottom: 25px;">
              <div style="background-color: #f9fafb; padding: 15px 10px; border-bottom: 2px solid #e5e7eb;">
                <h3 style="color: #1f2937; margin: 0; font-size: 18px; font-weight: 600;">
                  🛒 Chi tiết sản phẩm
                </h3>
              </div>
              
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f3f4f6;">
                    <th style="padding: 12px 10px; text-align: left; color: #374151;">Sản phẩm</th>
                    <th style="padding: 12px 10px; text-align: center; color: #374151;">Hình ảnh</th>
                    <th style="padding: 12px 10px; text-align: center; color: #374151;">SL</th>
                    <th style="padding: 12px 10px; text-align: right; color: #374151;">Đơn giá</th>
                    <th style="padding: 12px 10px; text-align: right; color: #374151;">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>

            <!-- Order Summary -->
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
              <table style="width: 100%;">
                <tr>
                  <td style="padding: 8px 0; color: #374151;">Tổng tiền hàng:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600;">
                    ${formatCurrency(order.total_price)}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #374151;">Phí vận chuyển:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600;">
                    ${formatCurrency(order.shippingFee)}
                  </td>
                </tr>
                ${order.voucherDiscount > 0 ? `
                  <tr>
                    <td style="padding: 8px 0; color: #374151;">Giảm giá:</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #059669;">
                      -${formatCurrency(order.voucherDiscount)}
                    </td>
                  </tr>
                ` : ''}
                <tr>
                  <td style="padding: 12px 0; color: #1f2937; font-weight: 700; font-size: 16px; border-top: 2px solid #e5e7eb;">
                    Tổng thanh toán:
                  </td>
                  <td style="padding: 12px 0; text-align: right; color: #dc2626; font-weight: 700; font-size: 16px; border-top: 2px solid #e5e7eb;">
                    ${formatCurrency(order.total)}
                  </td>
                </tr>
              </table>
            </div>

            <!-- Contact Info -->
            <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #f59e0b;">
              <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">
                📞 Liên hệ hỗ trợ
              </h3>
              <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
                Nếu bạn có bất kỳ thắc mắc nào về đơn hàng, vui lòng liên hệ với chúng tôi:<br>
                <strong>Hotline:</strong> 0123-456-789<br>
                <strong>Email:</strong> support@hipc.vn<br>
                <strong>Giờ làm việc:</strong> 8:00 - 20:00 (Thứ 2 - Chủ nhật)
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #1f2937; padding: 25px 20px; text-align: center;">
            <p style="color: #9ca3af; margin: 0 0 10px 0; font-size: 14px;">
              Cảm ơn bạn đã tin tưởng và lựa chọn HiPC!
            </p>
            <p style="color: #6b7280; margin: 0; font-size: 12px;">
              © 2025 HiPC - Thiết bị vi tính chất lượng cao. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    await sendMail({
      to: order.user_id.email,
      subject: `[HiPC] Thông tin đơn hàng #${order._id.toString().slice(-8)}`,
      html
    });

    console.log(`Order email sent successfully to ${order.user_id.email}`);
  } catch (err) {
    console.error("Error sending order email:", err);
  }
};

// Tạo mới đơn hàng
exports.createOrder = async (req, res) => {
  try {
    let {
      user_id,
      address,
      phoneNumber,
      paymentMethod,
      shippingMethod,
      selectedOrderVoucher,
      selectedShippingVoucher,
      products = [],
      shippingFee,
      selectedProducts,
    } = req.body;

    // Nếu có products (mua ngay), xử lý riêng
    if (
      Array.isArray(products) &&
      products.length > 0 &&
      (!Array.isArray(selectedProducts) || selectedProducts.length === 0)
    ) {
       // === FIX: Buy-now qua /checkout có trừ tồn biến thể + transaction ===
      const session = await mongoose.startSession();
      let totalPrice = 0;
      const orderProducts = [];

      await session.withTransaction(async () => {
        for (const raw of products) {
          const quantity = Math.max(1, Number(raw.quantity || 1));
          const prod = await Product.findById(raw.productId).session(session);
          if (!prod) throw new Error('Sản phẩm không tồn tại.');

          // Chuẩn hoá nguồn variantId: ưu tiên raw.variantId → raw.variant._id → tìm bằng label
          const variantId =
            raw.variantId || raw?.variant?._id || null;
          let variantDoc = null;

          if (variantId) {
            variantDoc = await VariantProduct.findById(variantId).session(session);
            if (!variantDoc) throw new Error('Không tìm thấy biến thể sản phẩm');
            // Atomic trừ tồn
            const up = await VariantProduct.updateOne(
              { _id: variantDoc._id, stock: { $gte: quantity } },
              { $inc: { stock: -quantity } },
              { session }
            );
            if (up.modifiedCount !== 1) {
              const left = (await VariantProduct.findById(variantDoc._id).session(session))?.stock ?? 0;
              throw new Error(`Biến thể ${variantDoc.name} không đủ tồn (còn ${left})`);
            }
          } else if (raw?.variant?.label) {
            // fallback theo label (tương thích FE cũ)
            variantDoc = await VariantProduct.findOne({
              product_id: prod._id,
              name: raw.variant.label
            }).session(session);
            if (!variantDoc) throw new Error(`Không tìm thấy biến thể ${raw.variant.label}`);
            const up = await VariantProduct.updateOne(
              { _id: variantDoc._id, stock: { $gte: quantity } },
              { $inc: { stock: -quantity } },
              { session }
            );
            if (up.modifiedCount !== 1) {
              const left = (await VariantProduct.findById(variantDoc._id).session(session))?.stock ?? 0;
              throw new Error(`Biến thể ${variantDoc.name} không đủ tồn (còn ${left})`);
            }
          } else {
            // Không có biến thể → trừ tồn sản phẩm gốc (atomic)
            const up = await Product.updateOne(
              { _id: prod._id, stock: { $gte: quantity } },
              { $inc: { stock: -quantity } },
              { session }
            );
            if (up.modifiedCount !== 1) {
              const fresh = await Product.findById(prod._id).session(session);
              const left = fresh?.stock ?? 0;
              throw new Error(`Sản phẩm ${fresh?.name || ''} không đủ tồn (còn ${left})`);
            }
          }

          // Tính giá line
          let itemPrice = Number(prod.price) || 0;
          let variantInfo = null;
          if (variantDoc) {
            // Ưu tiên variant.price; nếu không có thì base + priceDiff
            itemPrice = typeof variantDoc.price === 'number'
              ? Number(variantDoc.price)
              : (Number(prod.price) + Number(variantDoc.priceDiff || (variantDoc.price - Number(prod.price)) || 0));

            variantInfo = {
              _id: variantDoc._id,
              name: variantDoc.name,
              price: typeof variantDoc.price === 'number' ? Number(variantDoc.price) : undefined,
              priceDiff: typeof variantDoc.price === 'number' ? undefined : Number((variantDoc.price || 0) - Number(prod.price)),
              label: variantDoc.name, // để invoice cũ vẫn hiển thị
              key: raw?.variant?.key || 'Phiên bản'
            };
          } else if (raw?.variant) {
            // giữ tương thích dữ liệu cũ nếu FE có đính kèm variant.priceDiff
            itemPrice = Number(prod.price) + Number(raw.variant?.priceDiff || 0);
          }

          totalPrice += itemPrice * quantity;
          orderProducts.push({
            productId: prod._id,
            quantity,
            variant: variantInfo || raw?.variant || {}
          });
        }
        // (phần tính voucher/phí ship/tạo Order vẫn ở ngoài, giữ nguyên)
      });

      // Áp dụng voucher cho đơn hàng (chỉ loại 'order')
      let orderVoucherDiscount = 0,
        orderVoucherId = null;
      if (selectedOrderVoucher && selectedOrderVoucher.code) {
        const voucherDoc = await Voucher.findOne({
          code: selectedOrderVoucher.code.toUpperCase(),
        });
        if (voucherDoc && voucherDoc.apply_for === "order") {
          const validation = validateVoucherConditions(voucherDoc, totalPrice);
          if (!validation.valid)
            return res.status(400).json({ error: validation.message });
          orderVoucherDiscount = calculateDiscountAmount(
            voucherDoc,
            totalPrice
          );
          orderVoucherId = voucherDoc._id;
        }
      }

      // Áp dụng voucher cho phí vận chuyển (chỉ loại 'shipping')
      let shippingVoucherDiscount = 0,
        shippingVoucherId = null;
      if (selectedShippingVoucher && selectedShippingVoucher.code) {
        const voucherDoc = await Voucher.findOne({
          code: selectedShippingVoucher.code.toUpperCase(),
        });
        if (voucherDoc && voucherDoc.apply_for === "shipping") {
          const validation = validateVoucherConditions(voucherDoc, shippingFee);
          if (!validation.valid)
            return res.status(400).json({ error: validation.message });
          shippingVoucherDiscount = calculateDiscountAmount(
            voucherDoc,
            shippingFee
          );
          shippingVoucherId = voucherDoc._id;
        }
      }

      // Tính phí vận chuyển sau giảm
      const finalShippingFee = Math.max(
        0,
        shippingFee - shippingVoucherDiscount
      );

      // Tổng cuối cùng
      const finalTotal = Math.max(
        0,
        totalPrice - orderVoucherDiscount + finalShippingFee
      );

      // Tạo đơn hàng
      const order = new Order({
        user_id,
        products: orderProducts,
        address,
        phoneNumber,
        paymentMethod,
        shippingMethod,
        voucher: orderVoucherId, // voucher đơn hàng
        voucherDiscount: orderVoucherDiscount,
        shippingVoucher: shippingVoucherId, // voucher phí vận chuyển
        shippingVoucherDiscount: shippingVoucherDiscount,
        shippingFee: shippingFee,
        total_price: totalPrice,
        total: finalTotal,
        status: "pending",
      });
      await order.save();

      try {
        await sendOrderEmail(order._id, "pending"); // gửi mail khi đơn ở trạng thái pending
      } catch (err) {
        console.error("Failed to send order email:", err);
      }

      return res.status(200).json({
        message: "Đặt hàng thành công",
        orderId: order._id,
        amount: order.total,
        voucherDiscount: order.voucherDiscount || 0,
        shippingVoucherDiscount: order.shippingVoucherDiscount || 0,
        shippingFee: order.shippingFee || 0,
        des: order._id.toString(),
      });
    }

    // === CART CHECKOUT LOGIC - FIXED ===
    const cart = await Cart.findOne({ user_id })
      .populate("products.productId")
      .populate("products.comboId");

    if (!cart || !cart.products.length) {
      return res.status(400).json({ error: "Giỏ hàng trống" });
    }

    // Lọc sản phẩm được chọn
    let checkoutProducts = cart.products;
    if (Array.isArray(selectedProducts) && selectedProducts.length > 0) {
      let selectedIds = [];
      if (
        selectedProducts.length > 0 &&
        typeof selectedProducts[0] === "object" &&
        selectedProducts[0].cartItemId
      ) {
        selectedIds = selectedProducts.map((p) => p.cartItemId);
      } else {
        selectedIds = selectedProducts.map((id) => id.toString());
      }

      checkoutProducts = cart.products.filter((item) =>
        selectedIds.includes(item._id.toString())
      );
    }

    if (!checkoutProducts.length) {
      return res
        .status(400)
        .json({ error: "Không có sản phẩm nào được chọn để thanh toán" });
    }

    // Tính tổng tiền + kiểm tra tồn kho
    let totalPrice = 0;
    const orderProducts = [];
    const orderCombos = [];

    for (const item of checkoutProducts) {
      if (item.productId) {
        const prod = item.productId;
        const itemPrice = prod.price + (item.variant?.priceDiff || 0);
        const itemTotal = itemPrice * item.quantity;

        console.log("[CHECKOUT] Sản phẩm:", {
          name: prod.name,
          productId: prod._id,
          price: prod.price,
          variant: item.variant,
          priceDiff: item.variant?.priceDiff || 0,
          itemPrice,
          quantity: item.quantity,
          itemTotal,
        });

        // Nếu có biến thể thì kiểm tra và trừ tồn kho của biến thể
        if (item.variant && item.variant.label) {
          const variantDoc = await VariantProduct.findOne({
            product_id: prod._id,
            name: item.variant.label
          });
          if (!variantDoc) {
            return res.status(400).json({ error: `Không tìm thấy biến thể ${item.variant.label}` });
          }
          if (variantDoc.stock < item.quantity) {
            return res.status(400).json({
              error: `Số lượng tồn kho không đủ`,
              detail: {
                type: 'variant',
                name: variantDoc.name,
                stock: variantDoc.stock
              }
            });
          }
          await VariantProduct.updateOne(
            { _id: variantDoc._id },
            { $inc: { stock: -item.quantity } }
          );
        } else {
          // Nếu không có biến thể thì trừ vào sản phẩm gốc
          if (prod.stock < item.quantity) {
            return res.status(400).json({ error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock}` });
          }
          await Product.updateOne(
            { _id: prod._id },
            { $inc: { stock: -item.quantity } }
          );
        }

        totalPrice += itemTotal;
        orderProducts.push({
          productId: prod._id,
          quantity: item.quantity,
          variant: item.variant,
        });
      } else if (item.comboId) {
        const combo = await Combo.findById(item.comboId)
          .populate('productIds');
        
        if (!combo) {
          return res.status(404).json({ error: 'Combo không tồn tại' });
        }

        const comboProducts = [];
        
        // Process each product in combo
        for (const product of combo.productIds) {
          // Find variant selection for this product
          const selection = item.comboSelections?.find(s => 
            s.productId.toString() === product._id.toString()
          );

          let variantInfo = null;
          if (selection) {
            // Check variant stock
            const variant = await VariantProduct.findById(selection.variantId);
            if (!variant) {
              return res.status(404).json({ 
                error: `Không tìm thấy biến thể cho sản phẩm ${product.name}` 
              });
            }

            if (variant.stock < item.quantity) {
              return res.status(400).json({
                error: 'Số lượng vượt quá tồn kho',
                productName: product.name,
                variantName: variant.name,
                maxStock: variant.stock
              });
            }

            // Update variant stock
            await VariantProduct.updateOne(
              { _id: variant._id },
              { $inc: { stock: -item.quantity } }
            );

            variantInfo = {
              _id: variant._id,
              name: variant.name,
              price: variant.price,
              priceDiff: variant.price - product.price
            };
          } else {
            // Check product stock
            if (product.stock < item.quantity) {
              return res.status(400).json({
                error: `Sản phẩm ${product.name} trong combo chỉ còn ${product.stock}`
              });
            }

            // Update product stock
            await Product.updateOne(
              { _id: product._id },
              { $inc: { stock: -item.quantity } }
            );
          }

          comboProducts.push({
            productId: product._id,
            variant: variantInfo
          });
        }

        const comboTotal = combo.price * item.quantity;
        totalPrice += comboTotal;

        orderCombos.push({
          comboId: combo._id,
          quantity: item.quantity,
          price: combo.price,
          products: comboProducts
        });
      }
    }

    // === FIXED: Apply ORDER voucher ===
    let orderVoucherDiscount = 0,
      orderVoucherId = null;
    if (selectedOrderVoucher && selectedOrderVoucher.code) {
      const voucherDoc = await Voucher.findOne({
        code: selectedOrderVoucher.code.toUpperCase(),
      });
      if (voucherDoc && voucherDoc.apply_for === "order") {
        const validation = validateVoucherConditions(voucherDoc, totalPrice);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.message });
        }
        orderVoucherDiscount = calculateDiscountAmount(voucherDoc, totalPrice);
        orderVoucherId = voucherDoc._id;
      }
    }

    // === FIXED: Apply SHIPPING voucher ===
    let shippingVoucherDiscount = 0,
      shippingVoucherId = null;
    if (selectedShippingVoucher && selectedShippingVoucher.code) {
      const voucherDoc = await Voucher.findOne({
        code: selectedShippingVoucher.code.toUpperCase(),
      });
      if (voucherDoc && voucherDoc.apply_for === "shipping") {
        const validation = validateVoucherConditions(voucherDoc, shippingFee);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.message });
        }
        shippingVoucherDiscount = calculateDiscountAmount(
          voucherDoc,
          shippingFee
        );
        shippingVoucherId = voucherDoc._id;

        // Decrease voucher quantity for shipping voucher
        voucherDoc.quantity -= 1;
        voucherDoc.used_count = (voucherDoc.used_count || 0) + 1;
        voucherDoc.updated_at = new Date();
        await voucherDoc.save();
      }
    }

    // Decrease quantity for order voucher if used
    if (orderVoucherId) {
      await Voucher.updateOne(
        { _id: orderVoucherId },
        {
          $inc: { quantity: -1, used_count: 1 },
          $set: { updated_at: new Date() },
        }
      );
    }

    // === FIXED: Calculate final amounts ===
    const finalShippingFee = Math.max(
      0,
      (shippingFee || 0) - shippingVoucherDiscount
    );
    const finalTotal = Math.max(
      0,
      totalPrice - orderVoucherDiscount + finalShippingFee
    );

    // Log thông tin chi tiết trước khi tạo đơn hàng
    console.log("=== CHECKOUT CALCULATION ===");
    console.log("totalPrice (before vouchers):", totalPrice);
    console.log("orderVoucherDiscount:", orderVoucherDiscount);
    console.log("shippingFee (original):", shippingFee);
    console.log("shippingVoucherDiscount:", shippingVoucherDiscount);
    console.log("finalShippingFee:", shippingFee);
    console.log("finalTotal:", finalTotal);

    // Tạo đơn hàng
    const order = new Order({
      user_id,
      products: orderProducts,
      combos: orderCombos,
      address,
      phoneNumber,
      paymentMethod,
      shippingMethod,
      voucher: orderVoucherId,
      voucherDiscount: orderVoucherDiscount,
      shippingVoucher: shippingVoucherId,
      shippingVoucherDiscount: shippingVoucherDiscount,
      shippingFee: shippingFee,
      total_price: totalPrice,
      total: finalTotal,
      status: "pending",
    });

    // Populate the required fields before saving
    await order.populate([
      {
        path: 'combos.products.productId',
        select: 'name price'
      },
      {
        path: 'combos.products.variant._id',
        model: 'VariantProduct',
        select: 'name price'
      }
    ]);

    await order.save();

    try {
      await sendOrderEmail(order._id, "pending");
    } catch (err) {
      console.error("Failed to send order email:", err);
    }

    // Xóa các sản phẩm đã checkout khỏi giỏ hàng
    if (Array.isArray(selectedProducts) && selectedProducts.length > 0) {
      console.log("selectedProducts:", selectedProducts);
      console.log(
        "cart.products:",
        cart.products.map((i) => i._id.toString())
      );

      let selectedIds = [];
      if (
        typeof selectedProducts[0] === "object" &&
        selectedProducts[0].cartItemId
      ) {
        selectedIds = selectedProducts.map((p) => p.cartItemId.toString());
      } else {
        selectedIds = selectedProducts.map((id) => id.toString());
      }
      cart.products = cart.products.filter(
        (item) => !selectedIds.includes(item._id.toString())
      );
      await cart.save();
    }

    // Auto cancel logic (keeping existing)
    setInterval(async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      try {
        const expiredOrders = await Order.find({
          status: "pending",
          createdAt: { $lte: tenMinutesAgo },
        });

        for (const order of expiredOrders) {
          // Return stock for products
          for (const p of order.products) {
            await Product.updateOne(
              { _id: p.productId },
              { $inc: { stock: p.quantity } }
            );
          }
          // Return stock for combos if any
          for (const c of order.combos || []) {
            const combo = await Combo.findById(c.comboId);
            if (combo) {
              for (const pid of combo.productIds) {
                await Product.updateOne(
                  { _id: pid },
                  { $inc: { stock: c.quantity } }
                );
              }
            }
          }
          order.status = "cancelled";
          order.cancelledAt = new Date();
          await order.save();
          console.log(`Order ${order._id} auto-cancelled after 10 minutes`);
        }
      } catch (err) {
        console.error("Auto cancel orders error:", err);
      }
    }, 60 * 1000);

    // === FIXED: Return proper response ===
    res.status(200).json({
      message: "Đặt hàng thành công",
      orderId: order._id,
      amount: order.total,
      originalAmount: totalPrice,
      voucherDiscount: order.voucherDiscount || 0,
      shippingVoucherDiscount: order.shippingVoucherDiscount || 0,
      originalShippingFee: shippingFee || 0,
      finalShippingFee: order.shippingFee || 0,
      des: order._id.toString(),
    });
  } catch (err) {
    console.error("❌ CHECKOUT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getOrderById = async (req, res) => {
  const order = await Order.findById(req.params.orderId)
    .populate("user_id", "full_name email")
    .populate("products.productId", "name price")
    .lean();
  if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
  res.json(order);
};

// Lấy danh sách đơn hàng của 1 user
exports.getOrdersByUser = async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.params.userId })
      .populate('products.productId')
      .populate({
        path: 'combos.comboId',
        populate: {
          path: 'productIds',
          populate: [
            { path: 'category_id' },
            { path: 'brand_id' }
          ]
        }
      })
      .sort({ order_date: -1 });

    // Process orders to include full details
    const processedOrders = await Promise.all(orders.map(async (order) => {
      // Process regular products
      if (order.products && order.products.length > 0) {
        for (const product of order.products) {
          if (product.productId) {
            const image = await Image.findOne({ product_id: product.productId._id });
            product.productId.image = image ? image.url : null;
          }
        }
      }

      // Process combos
      if (order.combos && order.combos.length > 0) {
        for (const combo of order.combos) {
          // Get combo details
          const comboDoc = combo.comboId;
          if (comboDoc) {
            // Get images for combo products
            const comboProducts = await Promise.all(comboDoc.productIds.map(async (product) => {
              const image = await Image.findOne({ product_id: product._id });
              return {
                ...product.toObject(),
                image: image ? image.url : null
              };
            }));

            combo.products = comboProducts;

            // Add combo description
            combo.description = `Combo ${comboDoc.name} gồm: ${comboProducts
              .map(p => `${p.name}${p.variant ? ` - ${p.variant.name}` : ''}`)
              .join(', ')}`;
          }
        }
      }

      return {
        ...order.toObject(),
        itemCount: (order.products?.length || 0) + (order.combos?.length || 0),
        hasCombo: order.combos?.length > 0,
        totalItems: order.products.reduce((sum, p) => sum + p.quantity, 0) +
                   order.combos.reduce((sum, c) => sum + c.quantity, 0)
      };
    }));

    res.json(processedOrders);
  } catch (err) {
    console.error('Error fetching user orders:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const updates = req.body; // gồm các thuộc tính được phép sửa
    const order = await Order.findByIdAndUpdate(req.params.orderId, updates, {
      new: true,
      runValidators: true,
    });
    if (!order)
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Cập nhật trạng thái đơn hàng với kiểm tra workflow
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.orderId);
    if (!order)
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    if (!canTransition(order.status, status)) {
      return res.status(400).json({
        error: `Không thể chuyển từ trạng thái ${order.status} sang ${status}`,
      });
    }

    // Nếu chuyển sang cancelled và đơn đang ở các trạng thái này, hoàn lại stock
  if (
      status === "cancelled" &&
      ["pending", "confirmed", "packed", "picked", "shipping"].includes(order.status)
    ) {
      await restoreStockForOrder(order);
      order.isStockReturned = true; // đánh dấu đã hoàn kho để tránh hoàn lại lần 2
    }

    order.status = status;
    await order.save();
    await createOrderNotification(order, status);
    if (status === "delivered") {
      try {
        await sendOrderEmail(order._id, "delivered");
      } catch (err) {
        console.error("Failed to send delivery email:", err);
      }
    }
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Hủy đơn (chuyển status thành cancelled)
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
    // Chỉ cho phép hủy ở trạng thái chờ xác nhận và chờ lấy hàng
    if (!["pending", "packed"].includes(order.status)) {
      return res.status(400).json({
        error: "Chỉ được hủy đơn ở trạng thái chờ xác nhận hoặc chờ lấy hàng",
      });
    }
    // Hoàn stock nếu đơn chưa bị hủy và có sản phẩm
if (["pending", "packed"].includes(order.status) && !order.isStockReturned) {
      await restoreStockForOrder(order);
      order.isStockReturned = true;
    }
    order.status = "cancelled";
    order.cancelledAt = new Date();
    await order.save();
    await createOrderNotification(order, "cancelled");
    res.json({ message: "Đã hủy đơn và hoàn lại kho", order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteOrder = async (req, res) => {
  res.status(403).json({ error: "Không được phép xóa đơn hàng" });
};

exports.returnStockForCancelledOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn" });
    if (order.status !== "cancelled") {
      return res.status(400).json({ error: "Chỉ hoàn stock cho đơn đã hủy" });
    }
    if (order.isStockReturned) {
      return res.status(400).json({ error: "Đơn này đã hoàn kho trước đó" });
    }
        // Hoàn lại stock cho cả products và combo (nếu có)
    await restoreStockForOrder(order);
    order.isStockReturned = true;
    await order.save();

    res.json({ message: "Đã hoàn lại kho cho đơn đã hủy", orderId: order._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
