const Order = require("../../models/Order");
const Product = require("../../models/Product");
const ProductReview = require("../../models/Review");
const mongoose = require("mongoose");
const User = require("../../models/User");

const recalculateProductReviewStats = async (productId) => {
  const objectId = new mongoose.Types.ObjectId(productId);
  const stats = await ProductReview.aggregate([
    {
      $match: {
        productId: objectId,
        isHidden: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        averageReview: { $avg: "$reviewValue" },
        totalReviews: { $sum: 1 },
        ratings: { $push: "$reviewValue" },
      },
    },
  ]);

  const breakdown = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let averageReview = 0;
  let totalReviews = 0;

  if (stats.length) {
    totalReviews = stats[0].totalReviews;
    averageReview = stats[0].averageReview;
    stats[0].ratings.forEach((value) => {
      breakdown[String(value)] = (breakdown[String(value)] || 0) + 1;
    });
  }

  await Product.findByIdAndUpdate(productId, {
    averageReview,
    totalReviews,
    ratingBreakdown: breakdown,
  });

  return { averageReview, totalReviews, ratingBreakdown: breakdown };
};

const getValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? value : null;

const addProductReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, productId, reviewMessage, reviewValue } = req.body;

    if (
      !getValidObjectId(orderId) ||
      !getValidObjectId(productId)
    ) {
      return res.status(400).json({
        success: false,
        message: "orderId and productId must be valid.",
      });
    }

    if (
      typeof reviewValue !== "number" ||
      !Number.isInteger(reviewValue) ||
      reviewValue < 1 ||
      reviewValue > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Review value must be an integer from 1 to 5.",
      });
    }

    if (
      typeof reviewMessage !== "string" ||
      reviewMessage.trim().length < 1 ||
      reviewMessage.trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Review message must contain between 1 and 1000 characters.",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      userId,
      orderStatus: "delivered",
    });

    if (!order) {
      return res.status(403).json({
        success: false,
        message: "You need a completed order containing this product to review it.",
      });
    }

    const hasProduct = order.cartItems.some(
      (item) => String(item.productId) === String(productId)
    );

    if (!hasProduct) {
      return res.status(403).json({
        success: false,
        message: "This product is not in the selected order.",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const existingReview = await ProductReview.findOne({
      orderId,
      productId,
      userId,
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You already reviewed this product in this order!",
      });
    }

    const user = await User.findById(userId).select("userName");
    const newReview = new ProductReview({
      orderId,
      productId,
      userId,
      userName: user?.userName,
      reviewMessage: reviewMessage.trim(),
      reviewValue,
    });

    await newReview.save();
    const stats = await recalculateProductReviewStats(productId);

    res.status(201).json({
      success: true,
      data: newReview,
      stats,
    });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "You already reviewed this product in this order!",
      });
    }
    if (e?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: e.message,
      });
    }
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Error",
    });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!getValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "productId must be valid.",
      });
    }

    const reviews = await ProductReview.find({
      productId,
      isHidden: { $ne: true },
    }).sort({ createdAt: -1 });
    const stats = await recalculateProductReviewStats(productId);

    res.status(200).json({
      success: true,
      data: reviews,
      stats,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Error",
    });
  }
};

const updateProductReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;
    const { reviewMessage, reviewValue } = req.body;

    if (!getValidObjectId(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "reviewId must be valid.",
      });
    }

    if (
      typeof reviewValue !== "number" ||
      !Number.isInteger(reviewValue) ||
      reviewValue < 1 ||
      reviewValue > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Review value must be an integer from 1 to 5.",
      });
    }

    if (
      typeof reviewMessage !== "string" ||
      reviewMessage.trim().length < 1 ||
      reviewMessage.trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Review message must contain between 1 and 1000 characters.",
      });
    }

    const review = await ProductReview.findOne({
      _id: reviewId,
      userId,
    });

    if (!review) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own review.",
      });
    }

    review.reviewMessage = reviewMessage.trim();
    review.reviewValue = reviewValue;
    await review.save();
    const stats = await recalculateProductReviewStats(review.productId);

    res.status(200).json({
      success: true,
      data: review,
      stats,
    });
  } catch (e) {
    if (e?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: e.message,
      });
    }
    console.log(e);
    res.status(500).json({ success: false, message: "Error" });
  }
};

const deleteProductReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;

    if (!getValidObjectId(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "reviewId must be valid.",
      });
    }

    const review = await ProductReview.findOneAndDelete({
      _id: reviewId,
      userId,
    });

    if (!review) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own review.",
      });
    }

    const stats = await recalculateProductReviewStats(review.productId);
    res.status(200).json({
      success: true,
      stats,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ success: false, message: "Error" });
  }
};

const setProductReviewVisibility = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can change review visibility.",
      });
    }

    const { reviewId } = req.params;
    const { isHidden } = req.body;

    if (!getValidObjectId(reviewId) || typeof isHidden !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "reviewId and isHidden are required.",
      });
    }

    const review = await ProductReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    review.isHidden = isHidden;
    await review.save();
    const stats = await recalculateProductReviewStats(review.productId);

    res.status(200).json({
      success: true,
      data: review,
      stats,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ success: false, message: "Error" });
  }
};

module.exports = {
  addProductReview,
  getProductReviews,
  updateProductReview,
  deleteProductReview,
  setProductReviewVisibility,
};