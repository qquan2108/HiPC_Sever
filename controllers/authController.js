const crypto = require("crypto");
const User = require("../models/userModel");
const ResetToken = require("../models/ResetToken");
const sendEmail = require("../utils/sendEmail");

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email là bắt buộc." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy người dùng." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    await ResetToken.findOneAndDelete({ userId: user._id });

    const resetToken = new ResetToken({
      userId: user._id,
      token: hashedToken,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    await resetToken.save();

    const resetLink = `http://yourdomain.com/reset-password?token=${token}&id=${user._id}`;

    await sendEmail(
      user.email,
      "Đặt lại mật khẩu",
      `Nhấn vào link sau để đặt lại mật khẩu:\n${resetLink}\nLink này có hiệu lực trong 15 phút.`
    );

    res
      .status(200)
      .json({ message: "Email đặt lại mật khẩu đã được gửi." });
  } catch (error) {
    console.error("forgotPassword error:", error);
    res
      .status(500)
      .json({ message: "Đã xảy ra lỗi, vui lòng thử lại sau." });
  }
};
