require("dotenv").config();

const mongoose = require("mongoose");
const Product = require("../models/Product.js");
const { PRODUCT_CATEGORIES, LEGACY_BEST_SELLER_CATEGORY } = require("../constants/product.js");

const shouldApply = process.argv.includes("--apply");

function normalizeTitle(title) {
  return String(title || "").trim().toLocaleLowerCase();
}

async function auditProducts() {
  await mongoose.connect(process.env.MONGODB_URI);

  const products = await Product.find({}).sort({ createdAt: 1 }).lean();
  const groups = new Map();

  products.forEach((product) => {
    const key = normalizeTitle(product.title);
    const group = groups.get(key) || [];
    group.push(product);
    groups.set(key, group);
  });

  const duplicateGroups = Array.from(groups.values()).filter(
    (group) => group.length > 1
  );
  const legacyProducts = products.filter(
    (product) => product.category === LEGACY_BEST_SELLER_CATEGORY
  );

  console.log(`Products: ${products.length}`);
  console.log(`Duplicate title groups: ${duplicateGroups.length}`);
  console.log(`Legacy bestSeller categories: ${legacyProducts.length}`);

  for (const group of duplicateGroups) {
    const canonical =
      group.find((product) => product.category !== LEGACY_BEST_SELLER_CATEGORY) ||
      group[0];
    const shouldBeBestSeller = group.some(
      (product) =>
        product.isBestSeller ||
        product.category === LEGACY_BEST_SELLER_CATEGORY
    );

    console.log("\nDuplicate group:");
    group.forEach((product) => {
      console.log(
        `- ${product._id} | ${product.title} | category=${product.category} | isBestSeller=${Boolean(product.isBestSeller)}`
      );
    });
    console.log(
      `Canonical candidate: ${canonical._id} | category=${canonical.category} | isBestSeller=${shouldBeBestSeller}`
    );

    if (
      shouldApply &&
      PRODUCT_CATEGORIES.includes(canonical.category)
    ) {
      await Product.findByIdAndUpdate(
        canonical._id,
        { isBestSeller: shouldBeBestSeller },
        { runValidators: true }
      );
      await Product.deleteMany({
        _id: {
          $in: group
            .filter((product) => String(product._id) !== String(canonical._id))
            .map((product) => product._id),
        },
      });
    }
  }

  if (legacyProducts.length > 0) {
    console.log(
      "\nLegacy records require manual category migration before enabling schema validation:"
    );
    legacyProducts.forEach((product) => {
      console.log(`- ${product._id} | ${product.title}`);
    });
  }

  if (!shouldApply) {
    console.log("\nDry run only. Re-run with --apply after reviewing the output.");
  }
}

auditProducts()
  .catch((error) => {
    console.error("Product audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
