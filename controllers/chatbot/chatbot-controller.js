const Conversation = require("../../models/Conversation");
const Message = require("../../models/Message");
const { classifyIntent } = require("../../services/chatbot/intent-service");
const tools = require("../../services/chatbot/tool-service");

const MAX_MESSAGE_LENGTH = 1000;
const requestCounts = new Map();

function rateLimitKey(req) {
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
}

function checkRateLimit(key) {
  const now = Date.now();
  const windowStart = now - 60_000;
  if (requestCounts.size > 5000) {
    for (const [storedKey, times] of requestCounts) {
      const fresh = times.filter((time) => time > windowStart);
      if (fresh.length) requestCounts.set(storedKey, fresh);
      else requestCounts.delete(storedKey);
    }
  }
  const requests = (requestCounts.get(key) || []).filter((time) => time > windowStart);
  if (requests.length >= 20) return false;
  requests.push(now);
  requestCounts.set(key, requests);
  return true;
}

function readSessionId(req) {
  const header = typeof req.get("x-session-id") === "string" ? req.get("x-session-id").trim() : "";
  const body = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  if (header && body && header !== body) {
    return { error: "Session không khớp." };
  }
  const sessionId = header || body;
  if (sessionId && sessionId.length > 100) {
    return { error: "Session không hợp lệ." };
  }
  return { sessionId: sessionId || null };
}

function parseBudget(message) {
  const match = String(message).match(
    /(?:dưới|duoi|tối đa|toi da|không quá|khong qua|ít hơn|it hon)\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*(k|nghìn|ngan|đ|đồng|dong))?/i
  );
  if (!match) return 0;
  const raw = match[1];
  const unit = match[2] || "";
  const amount = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw)
    ? Number(raw.replace(/[.,]/g, ""))
    : Number(raw.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * (/^(k|nghìn|ngan)$/i.test(unit) ? 1000 : 1));
}

function detectCategory(message) {
  const text = String(message || "").toLowerCase();
  if (/trà sữa|trà|tea/.test(text)) return "traSua";
  if (/bánh|cake/.test(text)) return "banhNgot";
  if (/đá xay/.test(text)) return "daXay";
  if (/cà phê|cafe|coffee|latte|bạc xỉu|espresso|cappuccino|americano|mocha/.test(text)) return "caPhe";
  return "";
}

function detectTaste(message) {
  const text = String(message || "").toLowerCase();
  if (/ít cafein|ít caffeine|không cafein|không caffeine|decaf/.test(text)) {
    return ["trà", "sữa", "bánh", "cake"];
  }
  const taste = [];
  if (/ngọt/.test(text)) taste.push("ngọt");
  if (/đắng/.test(text)) taste.push("đắng");
  if (/thanh mát|mát/.test(text)) taste.push("mát");
  return taste;
}

function detectLocalIntent(message) {
  const text = String(message || "").toLowerCase();
  if (/nhân viên|admin|khiếu nại|gặp người/.test(text)) return "human_support";
  if (/đơn hàng|đơn của tôi|order|giao tới đâu|trạng thái/.test(text)) return "order_tracking";
  if (/voucher|mã giảm|khuyến mãi|giảm giá|promo/.test(text)) return "promotion_inquiry";
  if (/giá|bao nhiêu tiền|giá tiền/.test(text)) return "price_inquiry";
  if (/(dưới|duoi|tối đa|toi da|không quá|khong qua|ít hơn|it hon)\s*\d/.test(text)) return "product_recommendation";
  if (/thêm|đặt|cho tôi một ly|cho mình một ly/.test(text)) return "cart_assistance";
  if (/latte.*bạc xỉu|bạc xỉu.*latte|khác nhau|so sánh/.test(text)) return "product_comparison";
  if (/mở cửa|giờ hoạt động|địa chỉ|giao hàng|thanh toán|hủy đơn|đổi trả/.test(text)) return "faq";
  if (/bán chạy|có những|có loại|gợi ý|tư vấn|nguyên|ngọt|đắng|ngân sách|cà phê|latte|bạc xỉu|trà|bánh|món nào|sản phẩm/.test(text)) return "product_recommendation";
  return "general_chat";
}

async function ensureOwnedConversation(req, conversationId) {
  if (!conversationId || !conversationId.match(/^[0-9a-fA-F]{24}$/)) return null;
  const { sessionId } = readSessionId(req);
  let conversation;
  try {
    conversation = await Conversation.findById(conversationId);
  } catch (error) {
    return null;
  }
  if (!conversation) return null;

  if (conversation.userId) {
    if (!req.user || conversation.userId.toString() !== String(req.user.id)) return null;
    return conversation;
  }

  if (!conversation.sessionId || conversation.sessionId !== sessionId) return null;
  if (req.user) {
    conversation.userId = req.user.id;
    await conversation.save();
  }
  return conversation;
}

async function claimGuestConversations(req) {
  const { sessionId } = readSessionId(req);
  if (!req.user || !sessionId) return;
  await Conversation.updateMany(
    { userId: null, sessionId },
    { $set: { userId: req.user.id } }
  );
}

async function buildRuleBasedResponse(intent, entities, message, req) {
  if (intent === "human_support") {
    return {
      text: "Mình đã ghi nhận yêu cầu chuyển nhân viên. Bạn có thể mô tả chi tiết vấn đề để nhân viên hỗ trợ tốt hơn.",
      metadata: { handoffRequested: true },
      products: [],
    };
  }

  if (intent === "promotion_inquiry") {
    const vouchers = await tools.getPromotions();
    if (!vouchers.length) {
      return { text: "Hiện chưa có chương trình khuyến mãi đang hoạt động.", metadata: {}, products: [] };
    }
    return {
      text: "Các chương trình khuyến mãi đang hoạt động:",
      metadata: { vouchers: vouchers.slice(0, 5) },
      products: [],
    };
  }

  if (intent === "faq") {
    const faqs = await tools.getFAQ(message);
    if (!faqs.length) {
      return {
        text: "Mình chưa tìm thấy thông tin phù hợp trong FAQ. Nếu bạn cần, mình có thể chuyển yêu cầu cho nhân viên.",
        metadata: { unanswered: true },
        products: [],
      };
    }
    return { text: faqs.map((faq) => faq.answer).join("\n\n"), metadata: { faqs }, products: [] };
  }

  if (intent === "order_tracking") {
    if (!req.user) {
      return { text: "Bạn vui lòng đăng nhập để tra cứu đơn hàng thuộc tài khoản của mình.", metadata: { requiresAuth: true }, products: [] };
    }
    const orders = await tools.getOrders(req.user.id);
    if (!orders.length) {
      return { text: "Hiện tài khoản của bạn chưa có đơn hàng.", metadata: {}, products: [] };
    }
    return {
      text: `Bạn có ${orders.length} đơn hàng gần nhất:`,
      metadata: { orders: orders.map((order) => ({
        id: order._id,
        status: order.orderStatus,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        orderDate: order.orderDate,
      })) },
      products: [],
    };
  }

  if (intent === "cart_assistance") {
    const products = await tools.searchProducts({
      productNames: entities.productNames || [],
      category: entities.category || "",
      budget: entities.budget || 0,
      taste: entities.taste || [],
    });
    if (!products.length) {
      return { text: "Mình chưa tìm thấy sản phẩm phù hợp để thêm vào giỏ hàng.", metadata: {}, products: [] };
    }
    return {
      text: "Mình tìm được các sản phẩm phù hợp. Sau khi bạn chọn món, mình sẽ hỏi số lượng và yêu cầu xác nhận trước khi thêm vào giỏ hàng.",
      metadata: { cartCandidates: products.map((product) => product._id) },
      products,
    };
  }

  if (["product_search", "product_recommendation", "product_detail", "product_comparison", "price_inquiry"].includes(intent)) {
    const products = await tools.searchProducts({
      productNames: entities.productNames || [],
      category: entities.category || "",
      budget: entities.budget || 0,
      taste: entities.taste || [],
      bestseller: /bán chạy|nổi bật|hot/.test(message.toLowerCase()),
    });
    if (!products.length) {
      return {
        text: "Mình không tìm thấy sản phẩm phù hợp trong danh mục đang kinh doanh.",
        metadata: { unanswered: true },
        products: [],
      };
    }
    return {
      text: intent === "price_inquiry"
        ? "Thông tin giá của các món phù hợp:"
        : "Mình tìm được các lựa chọn phù hợp:",
      metadata: {},
      products,
    };
  }

  return {
    text: "Mình có thể tư vấn món uống, giá, voucher, đơn hàng hoặc kết nối với nhân viên. Bạn cần mình hỗ trợ phần nào?",
    metadata: {},
    products: [],
  };
}

async function generateAIResponse(intent, entities, message, history, toolResult) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return toolResult.text;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
    const prompt = [
      "Bạn là nhân viên tư vấn của The Coffee Shop.",
      "Chỉ được diễn giải dữ liệu đã được backend xác thực.",
      "Không bịa tên món, giá, voucher, trạng thái đơn hàng hoặc chương trình.",
      "Không xác nhận giao dịch hoặc thay đổi dữ liệu.",
      "Trả lời ngắn gọn bằng tiếng Việt.",
      `Intent: ${intent}`,
      `Entities: ${JSON.stringify(entities)}`,
      `Dữ liệu backend: ${JSON.stringify(toolResult)}`,
      `Ngữ cảnh: ${JSON.stringify(history.slice(-8))}`,
      `Tin nhắn khách: ${message}`,
    ].join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!response.ok) return toolResult.text;
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || toolResult.text;
  } catch (error) {
    return toolResult.text;
  }
}

exports.createConversation = async (req, res) => {
  const { sessionId, error } = readSessionId(req);
  if (error) return res.status(400).json({ success: false, message: error });
  if (!req.user && !sessionId) {
    return res.status(400).json({ success: false, message: "Thiếu sessionId." });
  }
  if (!checkRateLimit(rateLimitKey(req))) {
    return res.status(429).json({ success: false, message: "Bạn gửi yêu cầu quá nhanh." });
  }
  const conversation = await Conversation.create({
    userId: req.user?.id || null,
    sessionId: sessionId || null,
    status: "active",
  });
  res.status(201).json({ success: true, data: conversation });
};

exports.listConversations = async (req, res) => {
  const { sessionId, error } = readSessionId(req);
  if (error) return res.status(400).json({ success: false, message: error });
  if (!req.user && !sessionId) {
    return res.status(400).json({ success: false, message: "Thiếu sessionId." });
  }
  if (req.user) await claimGuestConversations(req);
  const filter = req.user
    ? { userId: req.user.id }
    : { sessionId, userId: null };
  const conversations = await Conversation.find(filter).sort({ updatedAt: -1 }).limit(30);
  res.status(200).json({ success: true, data: conversations });
};

exports.getConversationMessages = async (req, res) => {
  const conversation = await ensureOwnedConversation(req, req.params.id);
  if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại." });
  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).limit(200);
  res.status(200).json({ success: true, data: { conversation, messages } });
};

exports.sendMessage = async (req, res) => {
  const { sessionId, error } = readSessionId(req);
  if (error) return res.status(400).json({ success: false, message: error });
  if (!req.user && !sessionId) {
    return res.status(400).json({ success: false, message: "Thiếu sessionId." });
  }
  if (!checkRateLimit(rateLimitKey(req))) {
    return res.status(429).json({ success: false, message: "Bạn gửi yêu cầu quá nhanh." });
  }

  const message = String(req.body.message || "").trim();
  if (!message) return res.status(400).json({ success: false, message: "Tin nhắn trống." });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, message: "Tin nhắn quá dài." });
  }

  let conversation = await ensureOwnedConversation(req, req.params.id);
  if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại." });
  if (conversation.status === "closed") {
    return res.status(409).json({ success: false, message: "Hội thoại đã đóng." });
  }

  await Message.create({
    conversationId: conversation._id,
    sender: "user",
    content: message,
  });

  if (conversation.status === "waiting_human") {
    const assistantMessage = await Message.create({
      conversationId: conversation._id,
      sender: "assistant",
      content: "Hội thoại đang được nhân viên hỗ trợ. Bạn cứ nhắn thêm, nhân viên sẽ trả lời tại đây.",
      intent: "human_support",
      metadata: { handoffRequested: true },
    });
    conversation.updatedAt = new Date();
    await conversation.save();
    return res.status(200).json({
      success: true,
      data: {
        conversation,
        message: assistantMessage,
        products: [],
        metadata: assistantMessage.metadata,
      },
    });
  }

  const history = await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1 }).limit(10).lean();
  const normalizedHistory = history.reverse().map((item) => ({ sender: item.sender, content: item.content }));
  const deterministicIntent = detectLocalIntent(message);
  let classified =
    deterministicIntent !== "general_chat"
      ? { intent: deterministicIntent, entities: {}, source: "rule" }
      : await classifyIntent(message, normalizedHistory);

  const entities = { ...(classified.entities || {}) };
  const mentionedProducts = await tools.matchProductTitles(message);
  if (mentionedProducts.length) {
    entities.productNames = mentionedProducts;
    entities.category = "";
  } else if (!entities.category) {
    entities.category = detectCategory(message);
  }
  const budget = parseBudget(message);
  if (budget) entities.budget = budget;
  const taste = detectTaste(message);
  if (taste.length && !mentionedProducts.length) entities.taste = taste;
  const toolResult = await buildRuleBasedResponse(classified.intent, entities, message, req);
  const text = classified.source === "rule"
    ? toolResult.text
    : await generateAIResponse(classified.intent, entities, message, normalizedHistory, toolResult);

  const metadata = {
    ...toolResult.metadata,
    intent: classified.intent,
  };

  const assistantMessage = await Message.create({
    conversationId: conversation._id,
    sender: "assistant",
    content: text,
    intent: classified.intent,
    metadata,
  });

  conversation.lastIntent = classified.intent;
  if (metadata.unanswered) conversation.unansweredCount += 1;
  if (classified.intent === "human_support") {
    conversation.status = "waiting_human";
    conversation.handoffReason = message;
  }
  conversation.updatedAt = new Date();
  await conversation.save();

  res.status(200).json({
    success: true,
    data: {
      conversation,
      message: assistantMessage,
      products: toolResult.products || [],
      metadata,
    },
  });
};

exports.confirmAddToCart = async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Vui lòng đăng nhập." });
  const conversation = await ensureOwnedConversation(req, req.params.id);
  if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại." });
  const { productId, quantity } = req.body;
  if (!productId || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ success: false, message: "Thông tin thêm giỏ hàng không hợp lệ." });
  }
  try {
    await tools.addConfirmedItemToCart(req.user.id, productId, quantity);
    await Message.create({
      conversationId: conversation._id,
      sender: "assistant",
      content: `Đã thêm ${quantity} sản phẩm vào giỏ hàng sau khi bạn xác nhận.`,
      intent: "cart_assistance",
      metadata: { cartUpdated: true, productId, quantity },
    });
    res.status(200).json({ success: true, message: "Đã thêm sản phẩm vào giỏ hàng." });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.createHumanHandoff = async (req, res) => {
  const { sessionId, error } = readSessionId(req);
  if (error) return res.status(400).json({ success: false, message: error });
  if (!req.user && !sessionId) {
    return res.status(400).json({ success: false, message: "Thiếu sessionId." });
  }
  if (!checkRateLimit(rateLimitKey(req))) {
    return res.status(429).json({ success: false, message: "Bạn gửi yêu cầu quá nhanh." });
  }
  const conversation = await ensureOwnedConversation(req, req.params.id);
  if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại." });
  if (conversation.status === "closed") {
    return res.status(409).json({ success: false, message: "Hội thoại đã đóng." });
  }
  const reason = String(req.body.reason || "Khách yêu cầu hỗ trợ nhân viên").trim().slice(0, 1000);
  const request = await tools.createHumanHandoff({
    userId: req.user?.id,
    name: req.user?.userName || "Khách",
    email: req.user?.email || `guest-${conversation.sessionId}@chat.local`,
    conversationId: conversation._id,
    reason,
  });
  conversation.status = "waiting_human";
  conversation.handoffReason = reason;
  await conversation.save();
  res.status(201).json({ success: true, data: request, message: "Đã tạo yêu cầu hỗ trợ cho nhân viên." });
};



