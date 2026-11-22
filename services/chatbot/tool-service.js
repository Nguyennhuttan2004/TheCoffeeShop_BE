const Product = require("../../models/Product");
const Voucher = require("../../models/Voucher");
const FAQ = require("../../models/FAQ");
const Order = require("../../models/Order");
const Cart = require("../../models/Cart");
const SupportRequest = require("../../models/SupportRequest");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GENERIC_TITLE_WORDS = new Set(["nóng", "lạnh", "nhỏ", "lớn", "vừa", "size", "ly"]);

async function matchProductTitles(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return [];
  const products = await Product.find().select("title").lean();
  return products
    .filter((product) => {
      const title = String(product.title || "").toLowerCase().trim();
      if (!title) return false;
      if (text.includes(title)) return true;
      return title
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length >= 4 && !GENERIC_TITLE_WORDS.has(word))
        .some((word) => text.includes(word));
    })
    .map((product) => product.title);
}

async function searchProducts({ productNames = [], category = "", budget = 0, taste = [], bestseller = false } = {}) {
  const filter = { totalStock: { $gt: 0 }, stockStatus: { $ne: "outOfStock" } };
  if (category) {
    const categoryMap = {
      "cà phê": "caPhe",
      coffee: "caPhe",
      "trà": "traSua",
      tea: "traSua",
      "trà sữa": "traSua",
      "bánh": "banhNgot",
      cake: "banhNgot",
      "đá xay": "daXay",
    };
    const normalized = String(category).toLowerCase();
    filter.category = categoryMap[normalized] || category;
  }
  if (Number(budget) > 0) {
    filter.$expr = {
      $lte: [{ $cond: [{ $gt: ["$salePrice", 0] }, "$salePrice", "$price"] }, Number(budget)],
    };
  }
  if (bestseller) {
    filter.isBestSeller = true;
  }
  if (productNames.length) {
    filter.title = {
      $in: productNames.map((name) => new RegExp(escapeRegex(String(name)), "i")),
    };
  }
  if (taste.length) {
    const tasteRegex = taste.map((item) => escapeRegex(String(item))).join("|");
    filter.$and = [
      ...(filter.$and || []),
      { $or: [
        { title: new RegExp(tasteRegex, "i") },
        { description: new RegExp(tasteRegex, "i") },
      ] },
    ];
  }
  return Product.find(filter).sort({ isBestSeller: -1, price: 1 }).limit(8).lean();
}

async function getPromotions() {
  return Voucher.find({
    isActive: true,
    $or: [{ expiredAt: { $exists: false } }, { expiredAt: { $gt: new Date() } }],
  }).sort({ expiredAt: 1 }).lean();
}

async function getFAQ(message) {
  const keywords = String(message).toLowerCase().split(/\s+/).filter((word) => word.length >= 3);
  const regexes = keywords.map((word) => new RegExp(escapeRegex(word), "i"));
  return FAQ.find({
    isActive: true,
    $or: [
      { keywords: { $in: regexes } },
      { question: { $in: regexes } },
    ],
  }).limit(3).lean();
}

async function getOrders(userId) {
  return Order.find({ userId })
    .populate("cartItems.productId", "title image")
    .sort({ orderDate: -1 })
    .limit(10)
    .lean();
}

async function addConfirmedItemToCart(userId, productId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Số lượng không hợp lệ.");
  }
  const product = await Product.findOne({
    _id: productId,
    totalStock: { $gte: quantity },
  });
  if (!product) throw new Error("Sản phẩm không tồn tại hoặc không đủ tồn kho.");

  let cart = await Cart.findOne({ userId });
  if (!cart) cart = new Cart({ userId, items: [] });

  const index = cart.items.findIndex((item) => item.productId.toString() === productId);
  if (index >= 0) {
    const nextQuantity = cart.items[index].quantity + quantity;
    if (nextQuantity > product.totalStock) {
      throw new Error("Số lượng vượt quá tồn kho.");
    }
    cart.items[index].quantity = nextQuantity;
  } else {
    cart.items.push({
      productId: product._id,
      quantity,
      title: product.title,
      price: product.price,
      salePrice: product.salePrice,
      image: product.image,
    });
  }
  await cart.save();
  return cart;
}

async function createHumanHandoff({ userId, name, email, conversationId, reason }) {
  const request = await SupportRequest.create({
    name: name || "Khách hàng",
    email,
    message: `Conversation: ${conversationId}\nLý do: ${reason || "Khách yêu cầu hỗ trợ nhân viên"}`,
  });
  return request;
}

module.exports = {
  matchProductTitles,
  searchProducts,
  getPromotions,
  getFAQ,
  getOrders,
  addConfirmedItemToCart,
  createHumanHandoff,
};
