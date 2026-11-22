const express = require("express");
const jwt = require("jsonwebtoken");
const { authMiddleware } = require("../../controllers/auth/auth-controller");
const controller = require("../../controllers/chatbot/chatbot-controller");

const router = express.Router();

function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, "CLIENT_SECRET_KEY");
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ.",
    });
  }
}

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

router.use(optionalAuth);

router.post("/conversations", guard(controller.createConversation));
router.get("/conversations", guard(controller.listConversations));
router.get("/conversations/:id", guard(controller.getConversationMessages));
router.post("/conversations/:id/messages", guard(controller.sendMessage));
router.post("/conversations/:id/add-to-cart", authMiddleware, guard(controller.confirmAddToCart));
router.post("/conversations/:id/handoff", guard(controller.createHumanHandoff));

module.exports = router;
