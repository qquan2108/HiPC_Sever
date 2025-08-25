const mongoose = require("mongoose");

// Lịch sử thay đổi status
const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    build_id: { type: mongoose.Schema.Types.ObjectId, ref: "Build" },
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, default: 1 },
        variant: {
          _id: { type: mongoose.Schema.Types.ObjectId, ref: "VariantProduct" },
          key: String,
          label: String,
          price: Number,
          stock: Number,
          priceDiff: Number,
        },
      },
    ],
    combos: [
      {
        comboId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Combo",
          required: true,
        },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true },
        products: [
          {
            productId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Product",
              required: true,
            },
            name: { type: String, required: false }, // Make these optional since we can get from productId
            variant: {
              _id: { type: mongoose.Schema.Types.ObjectId, ref: "VariantProduct" },
              name: { type: String, required: false }, // Make variant fields optional
              price: Number,
              priceDiff: { type: Number, default: 0 },
            },
          },
        ],
      },
    ],
    status: {
      type: String,
      enum: [
        "pending",
        "packed",
        "shipping",
        "delivered",
        "return_requested",
        "cancelled",
      ],
      default: "pending",
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "failed", "refunded"],
      default: "unpaid",
    },
    phoneNumber: { type: Number, default: " " },

    statusHistory: [statusHistorySchema],
    total_price: Number,
    order_date: { type: Date, default: Date.now },
    address: String,
    paymentMethod: String,
    shippingMethod: String,
    voucher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      default: null,
    },
    voucherDiscount: { type: Number, default: 0 },
    shippingVoucher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      default: null,
    }, // mới
    shippingVoucherDiscount: { type: Number, default: 0 }, // mới
    shippingFee: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    cancelledAt: Date,
  },
  { timestamps: true }
);

// Tự động ghi lịch sử status mỗi khi thay đổi
orderSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push({ status: this.status, changedAt: new Date() });
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
