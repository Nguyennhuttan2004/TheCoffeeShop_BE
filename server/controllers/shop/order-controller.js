const paypal = require("../../helpers/paypal");
const Order = require("../../models/Order");
const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
mongoose = require("mongoose");

const createOrder = async (req, res) => {
  try {
    console.log("📥 Nhận dữ liệu từ Frontend:", req.body);

    const { userId, cartItems, addressId, paymentMethod, totalAmount } = req.body;

    if (!userId || !cartItems || cartItems.length === 0 || !addressId || !paymentMethod || !totalAmount) {
      console.log("⚠️ Thiếu thông tin đơn hàng!", req.body);
      return res.status(400).json({ success: false, message: "Thiếu thông tin đơn hàng!" });
    }

    // 🛠 Cấu hình thanh toán PayPal
    const create_payment_json = {
      intent: "sale",
      payer: { payment_method: "paypal" },
      redirect_urls: {
        return_url: "http://localhost:5173/shop/paypal-return",
        cancel_url: "http://localhost:5173/shop/paypal-cancel",
      },
      transactions: [
        {
          item_list: {
            items: cartItems.map((item) => ({
              name: item.title,
              sku: item.productId,
              price: item.price.toFixed(2),
              currency: "USD",
              quantity: item.quantity,
            })),
          },
          amount: { currency: "USD", total: totalAmount.toFixed(2) },
          description: "Thanh toán đơn hàng",
        },
      ],
    };

    console.log("📤 Gửi yêu cầu tạo thanh toán PayPal:", create_payment_json);

    paypal.payment.create(create_payment_json, async (error, paymentInfo) => {
      if (error) {
        console.error("❌ Lỗi khi tạo thanh toán PayPal:", error.response);
        return res.status(500).json({ success: false, message: "Lỗi khi tạo thanh toán PayPal", error: error.response });
      } else {
        console.log("✅ PayPal Payment Created:", paymentInfo);

        const approvalURL = paymentInfo.links.find((link) => link.rel === "approval_url")?.href;

        if (!approvalURL) {
          console.error("❌ Không tìm thấy `approvalURL`!");
          return res.status(500).json({ success: false, message: "Không lấy được `approvalURL` từ PayPal!" });
        }

        // Lưu đơn hàng vào database
        const newOrder = new Order({
          userId,
          cartItems,
          addressId,
          orderStatus: "pending",
          paymentMethod,
          paymentStatus: "pending",
          totalAmount,
          orderDate: new Date(),
          paymentId: paymentInfo.id,
        });

        await newOrder.save();

        res.status(201).json({ success: true, approvalURL, orderId: newOrder._id });
      }
    });
  } catch (error) {
    console.error("🚨 Server Error trong createOrder:", error);
    res.status(500).json({ success: false, message: "Lỗi server!", error: error.message });
  }
};


const capturePayment = async (req, res) => {
  try {
    console.log("📥 Nhận yêu cầu xác nhận thanh toán PayPal:", req.body);

    const { paymentId, payerId, orderId } = req.body;

    if (!paymentId || !payerId || !orderId) {
      console.log("⚠️ Thiếu thông tin xác nhận thanh toán!");
      return res.status(400).json({ success: false, message: "Thiếu thông tin xác nhận thanh toán" });
    }

    paypal.payment.execute(paymentId, { payer_id: payerId }, async (error, payment) => {
      if (error) {
        console.error("❌ Lỗi khi xác nhận thanh toán PayPal:", error.response);
        return res.status(500).json({ success: false, message: "Lỗi khi xác nhận thanh toán PayPal", error });
      }

      console.log("✅ PayPal Payment Captured:", payment);

      const updatedOrder = await Order.findByIdAndUpdate(orderId, {
        paymentStatus: "paid",  // ✅ Giữ nguyên trạng thái thanh toán là "paid"
        orderStatus: "pending", // ✅ Đặt trạng thái đơn hàng thành "pending"
        paymentId,
        payerId,
      }, { new: true });

      if (!updatedOrder) {
        console.error("❌ Không tìm thấy đơn hàng:", orderId);
        return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng!" });
      }

      res.json({ success: true, message: "Thanh toán thành công!", order: updatedOrder });
    });
  } catch (error) {
    console.error("🚨 Lỗi server trong capturePayment:", error);
    res.status(500).json({ success: false, message: "Lỗi server!", error: error.message });
  }
};



const getAllOrdersByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const orders = await Order.find({ userId })
      .populate("cartItems.productId")
      .populate("addressId");

    if (!orders.length) {
      return res.status(404).json({
        success: false,
        message: "No orders found!",
      });
    }

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error("Fetch Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching orders!",
    });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).populate("cartItems.productId").populate("addressId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found!",
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Fetch Order Details Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching order details!",
    });
  }
};

const getTotalRevenue = async (req, res) => {
  try {
    const totalRevenue = await Order.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmount" } } }]);
    res.status(200).json({ totalRevenue: totalRevenue[0]?.total || 0 });
  } catch (error) {
    console.error("Revenue Calculation Error:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createOrder,
  capturePayment,
  getAllOrdersByUser,
  getOrderDetails,
  getTotalRevenue,
};
