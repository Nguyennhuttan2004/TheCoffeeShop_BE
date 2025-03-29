const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: String, enum: ["user", "admin"], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const supportThreadSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true },
    userName: String,
    messages: [messageSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportThread", supportThreadSchema);
