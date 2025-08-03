const express = require("express");
const router = express.Router();
const resetPasswordController = require("../controllers/resetPassword.controller");

router.get("/reset-password", resetPasswordController.renderForm);
router.post("/reset-password", resetPasswordController.handleSubmit);

module.exports = router;
