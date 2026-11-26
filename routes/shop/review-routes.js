const express = require("express");

const {
  addProductReview,
  getProductReviews,
  updateProductReview,
  deleteProductReview,
  setProductReviewVisibility,
} = require("../../controllers/shop/product-review-controller");
const { authMiddleware } = require("../../controllers/auth/auth-controller");

const router = express.Router();

router.get("/:productId", getProductReviews);
router.post("/add", authMiddleware, addProductReview);
router.put("/:reviewId", authMiddleware, updateProductReview);
router.delete("/:reviewId", authMiddleware, deleteProductReview);
router.patch("/admin/:reviewId/visibility", authMiddleware, setProductReviewVisibility);

module.exports = router;