const express = require("express");

const {
  createOrder,
  getAllOrdersByUser,
  getOrderDetails,
  capturePayment,
  getTotalRevenue,
} = require("../../controllers/shop/order-controller");

const router = express.Router();
const { authMiddleware, requireSelfMiddleware } = require("../../controllers/auth/auth-controller");

// Tạo đơn hàng
router.post("/", authMiddleware, requireSelfMiddleware, createOrder);

// Thanh toán đơn hàng (PayPal)
router.post("/capture", authMiddleware, capturePayment);

// Lấy danh sách đơn hàng của người dùng
router.get("/user/:userId", authMiddleware, requireSelfMiddleware, getAllOrdersByUser);

// Lấy chi tiết đơn hàng
router.get("/:id", authMiddleware, getOrderDetails);

// Thống kê tổng doanh thu
router.get("/stats/total-revenue", getTotalRevenue);

module.exports = router;
