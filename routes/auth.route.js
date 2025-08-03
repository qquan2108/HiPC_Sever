const express = require("express");
const router = express.Router();
const { forgotPassword } = require("../controllers/authController");
const { forgotPasswordLimiter } = require("../middlewares/rateLimiter");

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);

module.exports = router;
