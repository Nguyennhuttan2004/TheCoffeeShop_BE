const express = require("express");
const router = express.Router();
const chatController = require("../../controllers/common/supportChat-controller");

router.post("/start", chatController.startOrAppendUserMessage);

// Admin gửi tin nhắn vào thread đã có
router.post("/:id/message", chatController.sendAdminMessage);

// Admin xem toàn bộ hội thoại
router.get("/all", chatController.getAllThreads);

// Lấy 1 thread theo ID (admin dùng)
router.get("/thread/:id", chatController.getThreadById);

// Lấy thread theo email (user dùng)
router.get("/user/:email", chatController.getThreadByEmail);
module.exports = router;
