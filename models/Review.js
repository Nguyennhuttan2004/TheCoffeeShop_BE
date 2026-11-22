const mongoose = require("mongoose");

const ProductReviewSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      trim: true,
    },
    reviewMessage: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1000,
    },
    reviewValue: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: (value) => Number.isInteger(value),
        message: "Review value must be an integer from 1 to 5.",
      },
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

ProductReviewSchema.index(
  { orderId: 1, productId: 1, userId: 1 },
  { unique: true }
);

module.exports = mongoose.model("ProductReview", ProductReviewSchema);