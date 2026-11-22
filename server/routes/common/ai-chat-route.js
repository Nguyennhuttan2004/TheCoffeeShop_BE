const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../../controllers/auth/auth-controller");
const { chatWithAssistant } = require("../../controllers/common/ai-chat-controller");

router.post("/chat", authMiddleware, chatWithAssistant);

module.exports = router;
