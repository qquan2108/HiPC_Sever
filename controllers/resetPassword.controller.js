const crypto = require("crypto");
const ResetToken = require("../models/resetToken.model");
const User = require("../models/user.model");

exports.renderForm = (req, res) => {
  const { token, id: userId } = req.query;
  if (!token || !userId) return res.status(400).send("Liên kết không hợp lệ");

  res.render("auth/reset-password", { token, userId });
};

exports.handleSubmit = async (req, res) => {
  const { token, userId, newPassword, confirmPassword } = req.body;

  if (!token || !userId || !newPassword || !confirmPassword) {
    return res.render("auth/reset-password", {
      token,
      userId,
      message: "Vui lòng điền đầy đủ thông tin.",
    });
  }

  if (newPassword !== confirmPassword) {
    return res.render("auth/reset-password", {
      token,
      userId,
      message: "Mật khẩu xác nhận không khớp.",
    });
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const tokenRecord = await ResetToken.findOne({
    userId,
    token: hashedToken,
    expiresAt: { $gt: Date.now() },
  });

  if (!tokenRecord) {
    return res.render("auth/reset-password", {
      token,
      userId,
      message: "Token đã hết hạn hoặc không hợp lệ.",
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.render("auth/reset-password", {
      token,
      userId,
      message: "Không tìm thấy người dùng.",
    });
  }

  user.password = newPassword; // bcrypt middleware sẽ hash
  await user.save();
  await ResetToken.deleteOne({ userId });

  res.render("auth/reset-password", {
    message: "🎉 Mật khẩu đã được cập nhật thành công. Bạn có thể đăng nhập lại.",
  });
};
