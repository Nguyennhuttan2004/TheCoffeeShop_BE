const Product = require("../../models/Product");
const Voucher = require("../../models/Voucher");
const SupportThread = require("../../models/SupportThread");

const MAX_MESSAGE_LENGTH = 1000;

function formatVnd(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value) || 0);
}

function buildRuleBasedReply(message, products, vouchers) {
  const normalized = message.toLowerCase();
  const availableProducts = products.filter((product) => product.totalStock > 0);

  if (/voucher|mã giảm|khuyến mãi|giảm giá/.test(normalized)) {
    if (!vouchers.length) {
      return "Hiện cửa hàng chưa có voucher đang hoạt động.";
    }

    return `Voucher đang hoạt động:\n${vouchers
      .slice(0, 5)
      .map((voucher) => {
        const discount =
          voucher.type === "percent"
            ? `Giảm ${voucher.value}%`
            : `Giảm ${formatVnd(voucher.value)}đ`;
        return `- ${voucher.code}: ${discount}, đơn tối thiểu ${formatVnd(voucher.minOrderAmount)}đ`;
      })
      .join("\n")}`;
  }

  if (!availableProducts.length) {
    return "Hiện tất cả món trong danh mục đều tạm hết hàng. Bạn có thể nhắn nhân viên để được hỗ trợ.";
  }

  let candidates = [...availableProducts];

  if (/bán chạy|nổi bật|hot/.test(normalized)) {
    candidates = candidates.filter((product) => product.isBestSeller);
  }

  if (/rẻ|tiết kiệm|ngân sách/.test(normalized)) {
    candidates.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price));
  }

  if (/ít cafein|ít caffeine|không cafein/.test(normalized)) {
    candidates = candidates.filter((product) => {
      const text = `${product.title} ${product.description || ""}`.toLowerCase();
      return text.includes("trà") || text.includes("sữa") || text.includes("cake") || text.includes("bánh");
    });
  }

  if (!candidates.length) {
    candidates = availableProducts;
  }

  return `Mình gợi ý một vài món phù hợp:\n${candidates
    .slice(0, 4)
    .map((product) => {
      const price = product.salePrice > 0 ? product.salePrice : product.price;
      return `- ${product.title}: ${formatVnd(price)}đ (${product.category})`;
    })
    .join("\n")}\n\nBạn thích ngọt, đắng, thanh mát hay ít caffeine để mình gợi ý chính xác hơn?`;
}

async function callGemini(message, products, vouchers, history) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const catalog = products.slice(0, 80).map((product) => ({
    title: product.title,
    category: product.category,
    price: product.salePrice > 0 ? product.salePrice : product.price,
    totalStock: product.totalStock,
    isBestSeller: product.isBestSeller,
    description: product.description || "",
  }));
  const activeVouchers = vouchers.map((voucher) => ({
    code: voucher.code,
    type: voucher.type,
    value: voucher.value,
    minOrderAmount: voucher.minOrderAmount,
  }));

  const prompt = [
    "Bạn là trợ lý tư vấn đồ uống của Coffee Shop.",
    "Chỉ gợi ý món có trong danh mục bên dưới.",
    "Không tự xác nhận đơn hàng, thanh toán, giao hàng hoặc thay đổi dữ liệu.",
    "Nếu câu hỏi ngoài thông tin đồ uống hoặc bạn không chắc, hãy đề nghị chuyển nhân viên.",
    "Trả lời ngắn gọn bằng tiếng Việt.",
    `DANH_MỤC=${JSON.stringify(catalog)}`,
    `VOUCHER=${JSON.stringify(activeVouchers)}`,
    `HỘI_THOẠI=${JSON.stringify(history.slice(-8))}`,
    `CÂU_HỎI_KHÁCH=${message}`,
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
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Gemini API error:", response.status, errorBody);
    return null;
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim() || null;
}

exports.chatWithAssistant = async (req, res) => {
  try {
    const { message, threadId } = req.body;
    const userEmail = req.user?.email;
    const userName = req.user?.userName;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, message: "Thiếu nội dung tin nhắn" });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Tin nhắn không được dài quá ${MAX_MESSAGE_LENGTH} ký tự`,
      });
    }

    if (!userEmail) {
      return res.status(400).json({ success: false, message: "Thiếu email người dùng" });
    }

    let thread = null;
    if (threadId) {
      thread = await SupportThread.findById(threadId);
      if (!thread || thread.userEmail !== userEmail) {
        return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại." });
      }
    } else {
      thread = await SupportThread.findOne({ userEmail });
    }

    if (!thread) {
      thread = new SupportThread({
        userEmail,
        userName: userName || "",
        messages: [],
      });
    }

    thread.messages.push({
      sender: "user",
      content: message.trim(),
    });

    const [products, vouchers] = await Promise.all([
      Product.find({}).sort({ isBestSeller: -1, price: 1 }).lean(),
      Voucher.find({
        isActive: true,
        $or: [
          { expiredAt: { $exists: false } },
          { expiredAt: { $gt: new Date() } },
        ],
      }).lean(),
    ]);

    let reply;
    try {
      reply = await callGemini(
        message.trim(),
        products,
        vouchers,
        thread.messages.slice(-10)
      );
    } catch (error) {
      console.error("Gemini request failed:", error);
    }

    reply = reply || buildRuleBasedReply(message.trim(), products, vouchers);

    thread.messages.push({
      sender: "ai",
      content: reply,
    });
    thread.updatedAt = new Date();
    await thread.save();

    return res.status(200).json({
      success: true,
      thread,
      reply,
    });
  } catch (error) {
    console.error("chatWithAssistant error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể xử lý yêu cầu tư vấn",
    });
  }
};
