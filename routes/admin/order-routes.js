const express = require("express");

const {
  getAllOrdersOfAllUsers,
  getOrderDetailsForAdmin,
  updateOrderStatus,
  getTotalOrders,
  getTotalRevenue,
  getSalesPerMonth
} = require("../../controllers/admin/order-controller.js");

const router = express.Router();

router.get("/get", getAllOrdersOfAllUsers);
router.get("/details/:id", getOrderDetailsForAdmin);
router.put("/update/:id", updateOrderStatus);
router.get('/total-orders', getTotalOrders); 
router.get('/total-revenue', getTotalRevenue);
router.get('/sales-per-month', getSalesPerMonth);

module.exports = router;
