const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    sessionId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ["active", "waiting_human", "closed"],
      default: "active",
    },
    handoffReason: { type: String, default: null },
    unansweredCount: { type: Number, default: 0 },
    lastIntent: { type: String, default: null },
  },
  { timestamps: true }
);

conversationSchema.index({ userId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
