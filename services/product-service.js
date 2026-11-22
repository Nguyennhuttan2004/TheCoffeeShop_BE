const Product = require("../models/Product.js");

const sortStrategies = {
  "price-lowtohigh": { price: 1 },
  "price-hightolow": { price: -1 },
  "title-atoz": { title: 1 },
  "title-ztoa": { title: -1 },
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseCategories(category) {
  if (!category) {
    return [];
  }

  const categories = Array.isArray(category) ? category : String(category).split(",");
  return categories.map((item) => item.trim()).filter(Boolean);
}

function parseBoolean(value) {
  return value === true || value === "true";
}

function buildProductFilter({ category, isBestSeller, keyword, discount } = {}) {
  const filter = {};
  const requestedCategories = parseCategories(category);
  const categories = requestedCategories.filter((item) => item !== "bestSeller");
  const trimmedKeyword = typeof keyword === "string" ? keyword.trim() : "";

  if (categories.length > 0) {
    filter.category = { $in: categories };
  }

  if (
    parseBoolean(isBestSeller) ||
    requestedCategories.includes("bestSeller")
  ) {
    filter.isBestSeller = true;
  }

  if (trimmedKeyword) {
    const keywordRegex = new RegExp(escapeRegex(trimmedKeyword), "i");
    filter.title = keywordRegex;
  }

  if (parseBoolean(discount)) {
    filter.salePrice = { $gt: 0 };
  }

  return filter;
}

async function findProducts(query = {}) {
  const filter = buildProductFilter(query);
  const sort = sortStrategies[query.sortBy] || sortStrategies["price-lowtohigh"];

  return Product.find(filter).sort(sort).lean();
}

module.exports = {
  buildProductFilter,
  findProducts,
  parseCategories,
};
