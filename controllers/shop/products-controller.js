const Product = require("../../models/Product.js");
const { findProducts } = require("../../services/product-service.js");

// 📦 Lấy danh sách sản phẩm theo bộ lọc & sắp xếp
const getFilteredProducts = async (req, res) => {
  try {
    const products = await findProducts(req.query);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy sản phẩm" });
  }
};


// 🔍 Lấy thông tin chi tiết sản phẩm
const getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: "Sản phẩm không tồn tại!" });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy chi tiết sản phẩm" });
  }
};


module.exports = { getFilteredProducts, getProductDetails };
