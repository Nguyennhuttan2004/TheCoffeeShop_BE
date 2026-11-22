
const express = require("express");

const {
  addToCart,
  fetchCartItems,
  deleteCartItem,
  updateCartItemQty,
} = require("../../controllers/shop/cart-controller");

const router = express.Router();
const { authMiddleware, requireSelfMiddleware } = require("../../controllers/auth/auth-controller");

router.post("/add", authMiddleware, requireSelfMiddleware, addToCart);
router.get("/get/:userId", authMiddleware, requireSelfMiddleware, fetchCartItems);
router.put("/update-cart", authMiddleware, requireSelfMiddleware, updateCartItemQty);
router.delete("/:userId/:productId", authMiddleware, requireSelfMiddleware, deleteCartItem);

module.exports = router;
