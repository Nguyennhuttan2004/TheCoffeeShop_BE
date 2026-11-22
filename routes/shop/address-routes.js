const express = require("express");

const {
  addAddress,
  fetchAllAddress,
  editAddress,
  deleteAddress,
} = require("../../controllers/shop/address-controller");

const router = express.Router();
const { authMiddleware, requireSelfMiddleware } = require("../../controllers/auth/auth-controller");

// Thêm địa chỉ mới
router.post("/", authMiddleware, requireSelfMiddleware, addAddress);

// Lấy danh sách địa chỉ của người dùng
router.get("/:userId", authMiddleware, requireSelfMiddleware, fetchAllAddress);

// Cập nhật địa chỉ
router.put("/:userId/:addressId", authMiddleware, requireSelfMiddleware, editAddress);

// Xóa địa chỉ
router.delete("/:userId/:addressId", authMiddleware, requireSelfMiddleware, deleteAddress);

module.exports = router;
