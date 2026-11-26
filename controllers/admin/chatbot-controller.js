const Conversation = require("../../models/Conversation");
const Message = require("../../models/Message");
const FAQ = require("../../models/FAQ");

function requireAdmin(req, res) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ success: false, message: "Không có quyền quản trị." });
    return false;
  }
  return true;
}

exports.getConversations = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.unanswered === "true") filter.unansweredCount = { $gt: 0 };
  const conversations = await Conversation.find(filter)
    .populate("userId", "userName email")
    .sort({ updatedAt: -1 })
    .limit(100);
  res.status(200).json({ success: true, data: conversations });
};

exports.getConversationDetail = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const conversation = await Conversation.findById(req.params.id).populate("userId", "userName email");
  if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại." });
  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
  res.status(200).json({ success: true, data: { conversation, messages } });
};

exports.updateConversationStatus = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!["active", "waiting_human", "closed"].includes(req.body.status)) {
    return res.status(400).json({ success: false, message: "Trạng thái hội thoại không hợp lệ." });
  }
  const conversation = await Conversation.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true }
  );
  if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại." });
  res.status(200).json({ success: true, data: conversation });
};

exports.replyToConversation = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const content = String(req.body.content || "").trim();
  if (!content || content.length > 1000) {
    return res.status(400).json({ success: false, message: "Nội dung phản hồi phải từ 1 đến 1000 ký tự." });
  }
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại." });
  if (conversation.status === "closed") return res.status(409).json({ success: false, message: "Hội thoại đã đóng." });
  const message = await Message.create({ conversationId: conversation._id, sender: "admin", content });
  conversation.updatedAt = new Date();
  await conversation.save();
  res.status(201).json({ success: true, data: { conversation, message } });
};

exports.getAnalytics = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const [conversationCount, activeCount, handoffCount, unansweredCount, messageCount] = await Promise.all([
    Conversation.countDocuments(),
    Conversation.countDocuments({ status: "active" }),
    Conversation.countDocuments({ status: "waiting_human" }),
    Conversation.aggregate([{ $group: { _id: null, total: { $sum: "$unansweredCount" } } }]),
    Message.countDocuments(),
  ]);
  res.status(200).json({
    success: true,
    data: {
      conversationCount,
      activeCount,
      handoffCount,
      unansweredCount: unansweredCount[0]?.total || 0,
      messageCount,
    },
  });
};

exports.listFaq = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const faqs = await FAQ.find().sort({ updatedAt: -1 });
  res.status(200).json({ success: true, data: faqs });
};

exports.createFaq = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { question, answer, keywords } = req.body;
  if (!question?.trim() || !answer?.trim()) {
    return res.status(400).json({ success: false, message: "Thiếu câu hỏi hoặc câu trả lời." });
  }
  const faq = await FAQ.create({
    question: question.trim(),
    answer: answer.trim(),
    keywords: Array.isArray(keywords) ? keywords : [],
  });
  res.status(201).json({ success: true, data: faq });
};

exports.updateFaq = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const faq = await FAQ.findByIdAndUpdate(
    req.params.id,
    {
      ...(req.body.question && { question: req.body.question }),
      ...(req.body.answer && { answer: req.body.answer }),
      ...(Array.isArray(req.body.keywords) && { keywords: req.body.keywords }),
      ...(typeof req.body.isActive === "boolean" && { isActive: req.body.isActive }),
    },
    { new: true, runValidators: true }
  );
  if (!faq) return res.status(404).json({ success: false, message: "Không tìm thấy FAQ." });
  res.status(200).json({ success: true, data: faq });
};

