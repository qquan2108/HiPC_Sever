const Order = require("../models/Order");
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
      .populate("user_id", "full_name email phone")
      .populate("products.productId", "name price")
      .lean();
    if (!order || !order.user_id) return;

    const imgMap = {};
    const productIds = order.products.map((p) => p.productId?._id);
    if (productIds.length) {
      const images = await Image.find({
        product_id: { $in: productIds },
      }).lean();
      images.forEach((img) => {
        imgMap[img.product_id.toString()] = img.url;
      });
    }

    // Format currency
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
      }).format(amount);
    };

    // Calculate total
    let totalAmount = 0;
    const rows = order.products
      .map((item) => {
        const prod = item.productId;
        const imgUrl = imgMap[prod._id.toString()] || "";
        const variant = item.variant
          ? `<span style="color: #666; font-size: 12px;">${item.variant.key}: ${item.variant.label}</span>`
          : "";
        const unitPrice =
          prod.price + (item.variant ? item.variant.priceDiff : 0);
        const itemTotal = unitPrice * item.quantity;
        totalAmount += itemTotal;

        return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 15px 10px; vertical-align: top;">
            <div style="font-weight: 600; color: #333; margin-bottom: 5px;">${
              prod.name
            }</div>
            ${variant}
          </td>
          <td style="padding: 15px 10px; text-align: center;">
            <img src="${imgUrl}" width="60" height="60" style="object-fit: cover; border-radius: 8px; border: 1px solid #eee;" alt="${
          prod.name
        }"/>
          </td>
          <td style="padding: 15px 10px; text-align: center; font-weight: 600; color: #2563eb;">
            ${item.quantity}
          </td>
          <td style="padding: 15px 10px; text-align: right; font-weight: 600;">
            ${formatCurrency(unitPrice)}
          </td>
          <td style="padding: 15px 10px; text-align: right; font-weight: 700; color: #dc2626;">
            ${formatCurrency(itemTotal)}
          </td>
        </tr>
      `;
      })
      .join("");

    const subject =
      type === "delivered"
        ? `🎉 [HiPC] Đơn hàng #${order._id
            .toString()
            .slice(-8)} đã được giao thành công`
        : type === "pending"
        ? `✅ [HiPC] Đặt hàng thành công #${order._id.toString().slice(-8)}`
        : `✅ [HiPC] Xác nhận đơn hàng #${order._id.toString().slice(-8)}`;

    const heading =
      type === "delivered"
        ? "🎉 Đơn hàng của bạn đã được giao thành công!"
        : type === "created"
        ? "✅ Đặt hàng thành công tại HiPC!"
        : "✅ Cảm ơn bạn đã đặt hàng tại HiPC!";

    const message =
      type === "delivered"
        ? "Cảm ơn bạn đã tin tưởng và mua sắm tại HiPC. Chúng tôi hy vọng bạn hài lòng với sản phẩm đã nhận được."
        : type === "created"
        ? "Đơn hàng của bạn đã được tạo thành công và đang chờ xác nhận. Chúng tôi sẽ liên hệ với bạn sớm nhất để xác nhận và giao hàng."
        : "Đơn hàng của bạn đã được tiếp nhận và đang được xử lý. Chúng tôi sẽ liên hệ với bạn sớm nhất để xác nhận và giao hàng.";

    const html = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
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

          <!-- Main Content -->
          <div style="padding: 30px 20px;">
            <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 24px; font-weight: 600;">
              ${heading}
            </h2>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
              ${message}
            </p>

            <!-- Order Info -->
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #2563eb;">
              <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">
                📋 Thông tin đơn hàng
              </h3>
              <div style="display: grid; gap: 8px;">
                <p style="margin: 0; color: #374151;"><strong>Mã đơn hàng:</strong> #${order._id
                  .toString()
                  .slice(-8)}</p>
                <p style="margin: 0; color: #374151;"><strong>👤 Khách hàng:</strong> ${
                  order.user_id.full_name
                }</p>
                <p style="margin: 0; color: #374151;"><strong>📞 Số điện thoại:</strong> ${
                  order.user_id.phone || "Chưa cung cấp"
                }</p>
                <p style="margin: 0; color: #374151;"><strong>📧 Email:</strong> ${
                  order.user_id.email
                }</p>
                <p style="margin: 0; color: #374151;"><strong>📍 Địa chỉ giao hàng:</strong> ${
                  order.address
                }</p>
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
                    <th style="padding: 15px 10px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #d1d5db;">Sản phẩm</th>
                    <th style="padding: 15px 10px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #d1d5db;">Hình ảnh</th>
                    <th style="padding: 15px 10px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #d1d5db;">SL</th>
                    <th style="padding: 15px 10px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #d1d5db;">Đơn giá</th>
                    <th style="padding: 15px 10px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #d1d5db;">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>

            <!-- Total Amount -->
            <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 25px;">
              <p style="color: #fecaca; margin: 0 0 5px 0; font-size: 16px; font-weight: 500;">
                💰 Tổng tiền đơn hàng
              </p>
              <p style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
                ${formatCurrency(totalAmount)}
              </p>
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

    await sendMail({
      to: order.user_id.email,
      subject,
      html,
    });

    console.log(
      `Order email sent successfully to ${
        order.user_id.email
      } for order #${order._id.toString().slice(-8)}`
    );
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
      // Xử lý giống buy-now nhưng cho phép nhiều sản phẩm
      let totalPrice = 0;
      const orderProducts = [];

      for (const item of products) {
        const prod = await Product.findById(item.productId);
        if (!prod) {
          return res.status(404).json({ error: `Sản phẩm không tồn tại.` });
        }
        if (prod.stock < item.quantity) {
          return res
            .status(400)
            .json({ error: `Sản phẩm ${prod.name} chỉ còn ${prod.stock}` });
        }
        const itemPrice = prod.price + (item.variant?.priceDiff || 0);
        const itemTotal = itemPrice * item.quantity;
        totalPrice += itemTotal;

        await Product.updateOne(
          { _id: prod._id },
          { $inc: { stock: -item.quantity } }
        );

        orderProducts.push({
          productId: prod._id,
          quantity: item.quantity,
          variant: item.variant,
        });
      }

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
        const combo = item.comboId;
        const comboProducts = await Product.find({
          _id: { $in: combo.productIds },
        });
        for (const prod of comboProducts) {
          if (prod.stock < item.quantity) {
            return res
              .status(400)
              .json({
                error: `Sản phẩm ${prod.name} trong combo chỉ còn ${prod.stock}`,
              });
          }
        }
        for (const prod of comboProducts) {
          await Product.updateOne(
            { _id: prod._id },
            { $inc: { stock: -item.quantity } }
          );
        }

        const comboTotal = combo.price * item.quantity;

        console.log("[CHECKOUT] Combo:", {
          comboId: combo._id,
          name: combo.name,
          price: combo.price,
          quantity: item.quantity,
          comboTotal,
        });

        totalPrice += comboTotal;
        orderCombos.push({
          comboId: combo._id,
          quantity: item.quantity,
          price: combo.price,
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
      voucher: orderVoucherId, // Order voucher ID
      voucherDiscount: orderVoucherDiscount,
      shippingVoucher: shippingVoucherId, // Shipping voucher ID
      shippingVoucherDiscount: shippingVoucherDiscount,
      shippingFee: shippingFee, // Already discounted
      total_price: totalPrice,
      total: finalTotal,
      status: "pending",
    });
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
      .populate("products.productId", "name price image")
      .sort({ order_date: -1 });
    res.json(orders);
  } catch (err) {
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
      ["pending", "confirmed", "packed", "picked", "shipping"].includes(
        order.status
      ) &&
      order.products &&
      order.products.length > 0
    ) {
      for (const item of order.products) {
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.quantity } }
        );
      }
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
    if (
      ["pending", "packed"].includes(order.status) &&
      order.products &&
      order.products.length > 0
    ) {
      for (const item of order.products) {
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.quantity } }
        );
      }
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
    if (!order.products || !order.products.length) {
      return res.status(400).json({ error: "Đơn không có sản phẩm" });
    }

    // Hoàn lại stock cho từng sản phẩm
    for (const item of order.products) {
      await Product.updateOne(
        { _id: item.productId },
        { $inc: { stock: item.quantity } }
      );
    }
    order.isStockReturned = true;
    await order.save();

    res.json({ message: "Đã hoàn lại kho cho đơn đã hủy", orderId: order._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
