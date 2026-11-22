const { imageUploadUtil } = require("../../helpers/cloudinary.js");
const Product = require("../../models/Product");
const Cart = require("../../models/Cart.js");
const ProductReview = require("../../models/Review.js");
const { PRODUCT_CATEGORIES } = require("../../constants/product.js");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 🖼️ Upload hình ảnh lên Cloudinary
const handleImageUpload = async (req, res) => {
  try {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const url = `data:${req.file.mimetype};base64,${b64}`;
    const result = await imageUploadUtil(url);

    res.json({ success: true, result });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Xảy ra lỗi khi upload ảnh!" });
  }
};

// ➕ Thêm sản phẩm mới
const addProduct = async (req, res) => {
  try {
    const { image, title, description, category, isBestSeller, size, price, salePrice, totalStock } = req.body;

    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) {
      return res.status(400).json({ success: false, message: "Tên sản phẩm không được để trống" });
    }

    if (!PRODUCT_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: "Danh mục sản phẩm không hợp lệ" });
    }

    const duplicate = await Product.findOne({
      title: { $regex: `^${escapeRegex(normalizedTitle)}$`, $options: "i" },
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: "Tên sản phẩm đã tồn tại" });
    }

    // Đảm bảo `salePrice` không vượt quá `price`
    if (salePrice > price) {
      return res.status(400).json({ success: false, message: "Sale price cannot be greater than the original price." });
    }

    const newProduct = new Product({
      image,
      title: normalizedTitle,
      description,
      category,
      isBestSeller: Boolean(isBestSeller),
      size,
      price,
      salePrice,
      totalStock,
    });

    await newProduct.save();
    res.status(201).json({ success: true, data: newProduct });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Lỗi khi thêm sản phẩm" });
  }
};

// 📦 Lấy danh sách tất cả sản phẩm
const fetchAllProducts = async (req, res) => {
  try {
    const products = await Product.find({});
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy sản phẩm" });
  }
};

// ✏️ Chỉnh sửa sản phẩm
const editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { image, title, description, category, isBestSeller, size, price, salePrice, totalStock } = req.body;

    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) {
      return res.status(400).json({ success: false, message: "Tên sản phẩm không được để trống" });
    }

    if (!PRODUCT_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: "Danh mục sản phẩm không hợp lệ" });
    }

    const duplicate = await Product.findOne({
      _id: { $ne: id },
      title: { $regex: `^${escapeRegex(normalizedTitle)}$`, $options: "i" },
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: "Tên sản phẩm đã tồn tại" });
    }

    // Đảm bảo `salePrice` không vượt quá `price`
    if (salePrice > price) {
      return res.status(400).json({ success: false, message: "Sale price cannot be greater than the original price." });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        image,
        title: normalizedTitle,
        description,
        category,
        isBestSeller: Boolean(isBestSeller),
        size,
        price,
        salePrice,
        totalStock,
      },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: "Sản phẩm không tồn tại" });
    }

    res.status(200).json({ success: true, data: updatedProduct });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Lỗi khi cập nhật sản phẩm" });
  }
};

// ❌ Xóa sản phẩm
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ success: false, message: "Sản phẩm không tồn tại" });
    }

    await Promise.all([
      Cart.updateMany({}, { $pull: { items: { productId: deletedProduct._id } } }),
      ProductReview.deleteMany({ productId: deletedProduct._id }),
    ]);

    res.status(200).json({ success: true, message: "Sản phẩm đã bị xóa" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Lỗi khi xóa sản phẩm" });
  }
};

module.exports = { handleImageUpload, addProduct, fetchAllProducts, editProduct, deleteProduct };
