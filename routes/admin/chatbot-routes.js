const express = require("express");
const { authMiddleware } = require("../../controllers/auth/auth-controller");
const controller = require("../../controllers/admin/chatbot-controller");

const router = express.Router();

function guard(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      console.error(error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "Không thể xử lý yêu cầu." });
      }
    });
  };
}

router.get("/conversations", authMiddleware, guard(controller.getConversations));
router.get("/conversations/:id", authMiddleware, guard(controller.getConversationDetail));
router.patch("/conversations/:id/status", authMiddleware, guard(controller.updateConversationStatus));
router.post("/conversations/:id/messages", authMiddleware, guard(controller.replyToConversation));
router.get("/analytics", authMiddleware, guard(controller.getAnalytics));
router.get("/faq", authMiddleware, guard(controller.listFaq));
router.post("/faq", authMiddleware, guard(controller.createFaq));
router.put("/faq/:id", authMiddleware, guard(controller.updateFaq));

module.exports = router;
