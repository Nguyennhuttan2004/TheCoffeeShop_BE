const INTENTS = [
  "product_search",
  "product_recommendation",
  "product_comparison",
  "product_detail",
  "price_inquiry",
  "promotion_inquiry",
  "faq",
  "order_tracking",
  "cart_assistance",
  "human_support",
  "general_chat",
  "unknown",
];

function fallbackIntent(message) {
  const text = String(message || "").toLowerCase();
  if (/nhân viên|admin|khiếu nại|gặp người|hỗ trợ người/.test(text)) return "human_support";
  if (/đơn hàng|đơn của tôi|order|giao tới đâu|trạng thái/.test(text)) return "order_tracking";
  if (/voucher|mã giảm|khuyến mãi|giảm giá|promo/.test(text)) return "promotion_inquiry";
  if (/giá|bao nhiêu tiền|giá tiền/.test(text)) return "price_inquiry";
  if (/thêm|đặt|cho tôi một ly|cho mình một ly|cho tôi 1 ly/.test(text)) return "cart_assistance";
  if (/latte.*bạc xỉu|bạc xỉu.*latte|khác nhau|so sánh/.test(text)) return "product_comparison";
  if (/bán chạy|có những|có loại|gợi ý|tư vấn|ngọt|đắng|khẩu vị|ngân sách/.test(text)) return "product_recommendation";
  if (/mở cửa|giờ hoạt động|địa chỉ|giao hàng|thanh toán|hủy đơn|đổi trả/.test(text)) return "faq";
  if (/tìm|có.*không|cho tôi xem|xem.*latte|latte|cà phê|trà|bánh/.test(text)) return "product_search";
  return "general_chat";
}

async function classifyIntent(message, history) {
  const deterministicIntent = fallbackIntent(message);
  if (deterministicIntent !== "general_chat") {
    return { intent: deterministicIntent, entities: {}, source: "rule" };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { intent: fallbackIntent(message), entities: {}, source: "fallback" };

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
    const prompt = [
      "Phan tich intent va entities cho tin nhan chatbot quan cafe.",
      `Intent hop le: ${INTENTS.join(", ")}`,
      "Chi tra ve JSON, khong dung markdown.",
      `Lich su gan day: ${JSON.stringify(history.slice(-6))}`,
      `Tin nhan: ${message}`,
      'Schema: {"intent":"...","entities":{"productNames":[],"category":"","budget":0,"taste":[],"quantity":0},"source":"gemini"}',
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
          generationConfig: { temperature: 0, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) return { intent: fallbackIntent(message), entities: {}, source: "fallback" };
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    if (!INTENTS.includes(parsed.intent)) throw new Error("Invalid intent");
    return { intent: parsed.intent, entities: parsed.entities || {}, source: "gemini" };
  } catch (error) {
    return { intent: fallbackIntent(message), entities: {}, source: "fallback" };
  }
}

module.exports = { classifyIntent, fallbackIntent };
