mongoose = require("mongoose");
const paypal = require("../../helpers/paypal");
const Order = require("../../models/Order");
const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { momoPaymentLogic } = require("../../helpers/momo");
const Voucher = require("../../models/Voucher");
const {
  Cart: CartCalculator,
  PercentVoucherDecorator,
  FixedVoucherDecorator,
} = require("../../helpers/cart-decorator");

const createOrder = async (req, res) => {
  try {
    const {
      userId,
      cartItems,
      addressId,
      paymentMethod,
      voucherCode
    } = req.body;

    if (!userId || !cartItems || !cartItems.length || !addressId || !paymentMethod) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin đơn hàng!" });
    }

    for (const item of cartItems) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Số lượng sản phẩm phải là số nguyên lớn hơn 0!",
        });
      }

      const product = await Product.findOne({
        _id: item.productId,
        totalStock: { $gte: item.quantity },
      });

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Sản phẩm "${item.title}" không đủ tồn kho!`,
        });
      }
    }

    // Tính tổng
    const cart = new CartCalculator(cartItems);
    const rawTotal = cart.getTotal();
    let finalTotal = rawTotal;
    let discount = 0;

    // Xử lý voucher
    if (voucherCode) {
      const voucher = await Voucher.findOne({ code: voucherCode.toUpperCase() });

      if (!voucher || !voucher.isActive || (voucher.expiredAt && new Date(voucher.expiredAt) < new Date())) {
        return res.status(400).json({
          success: false,
          message: "Voucher không hợp lệ hoặc đã hết hạn!",
        });
      }

      if (rawTotal < voucher.minOrderAmount) {
        return res.status(400).json({
          success: false,
          message: `Đơn hàng chưa đủ ${voucher.minOrderAmount}₫ để dùng mã giảm giá.`,
        });
      }

      // Áp dụng Decorator Pattern
      let decoratedCart = cart;
      if (voucher.type === "percent") {
        decoratedCart = new PercentVoucherDecorator(cart, voucher.value, voucher.maxDiscount);
      } else if (voucher.type === "fixed") {
        decoratedCart = new FixedVoucherDecorator(cart, voucher.value);
      }

      finalTotal = decoratedCart.getTotal();
      discount = rawTotal - finalTotal;
    }

    // Tạo đơn hàng
    const newOrder = new Order({
      userId,
      cartItems,
      addressId,
      paymentMethod,
      paymentStatus: "pending",
      orderStatus: "pending",
      totalAmount: finalTotal,
      voucherCode: voucherCode || null,
      orderDate: new Date(),
    });

    await newOrder.save();

    // Trừ tồn kho
    const decrementedItems = [];
    for (const item of cartItems) {
      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          totalStock: { $gte: item.quantity },
        },
        { $inc: { totalStock: -item.quantity } },
        { new: true, runValidators: true }
      );

      if (!updatedProduct) {
        for (const decrementedItem of decrementedItems) {
          await Product.findByIdAndUpdate(decrementedItem.productId, {
            $inc: { totalStock: decrementedItem.quantity },
          });
        }

        await Order.findByIdAndDelete(newOrder._id);
        return res.status(400).json({
          success: false,
          message: `Sản phẩm "${item.title}" không đủ tồn kho!`,
        });
      }

      decrementedItems.push({
        productId: item.productId,
        quantity: item.quantity,
      });
    }

    // ❗ Chỉ xóa cart ở đây 1 lần duy nhất
    await Cart.findOneAndDelete({ userId });

    // Xử lý từng phương thức thanh toán
    if (paymentMethod === "cash") {
      return res.status(201).json({
        success: true,
        message: "Đơn hàng thanh toán khi nhận đã được tạo",
        orderId: newOrder._id,
      });
    }

    if (paymentMethod === "momo") {
      const momoResult = await momoPaymentLogic({
        amount: finalTotal,
        orderInfo: `Order ID: ${newOrder._id}`,
        redirectUrl: "http://localhost:5173/shop/payment-success",
      });

      if (momoResult?.payUrl) {
        return res.status(201).json({
          success: true,
          payUrl: momoResult.payUrl,
          orderId: newOrder._id,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Tạo thanh toán MoMo thất bại",
      });
    }

    if (paymentMethod === "paypal") {
      const create_payment_json = {
        intent: "sale",
        payer: {
          payment_method: "paypal",
        },
        redirect_urls: {
          return_url: "http://localhost:5173/shop/payment-success",
          cancel_url: "http://localhost:5173/shop/payment-cancel",
        },
        transactions: [
          {
            item_list: {
              items: cartItems.map((item) => ({
                name: item.title,
                sku: item.productId,
                price: (item.salePrice > 0 ? item.salePrice : item.price).toString(),
                currency: "USD",
                quantity: item.quantity,
              })),
            },
            amount: {
              currency: "USD",
              total: finalTotal.toString(),
            },
            description: `Đơn hàng #${newOrder._id}`,
          },
        ],
      };

      paypal.payment.create(create_payment_json, (error, payment) => {
        if (error) {
          console.error("❌ PayPal error:", error);
          return res.status(500).json({ success: false, message: "PayPal error" });
        }

        const approvalURL = payment.links.find((link) => link.rel === "approval_url")?.href;

        return res.status(201).json({
          success: true,
          approvalURL,
          orderId: newOrder._id,
        });
      });

      return;
    }

    return res.status(400).json({
      success: false,
      message: "Phương thức thanh toán không hợp lệ.",
    });

  } catch (error) {
    console.error("🚨 createOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server!",
      error: error.message,
    });
  }
};


const capturePayment = async (req, res) => {
  try {
    const { paymentId, payerId, orderId } = req.body;
    if (!paymentId || !payerId || !orderId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin xác nhận thanh toán",
      });
    }

    paypal.payment.execute(
      paymentId,
      { payer_id: payerId },
      async (error, payment) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: "Lỗi khi xác nhận thanh toán PayPal",
            error,
          });
        }

        let updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          {
            paymentStatus: "paid",
            orderStatus: "pending",
            paymentId,
            payerId,
          },
          { new: true }
        );

        if (!updatedOrder) {
          return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy đơn hàng!" });
        }

        // ✅ Xoá giỏ hàng sau thanh toán
        await Cart.findOneAndDelete({ userId: updatedOrder.userId });

        res.json({
          success: true,
          message: "Thanh toán thành công!",
          order: updatedOrder,
        });
      }
    );
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server!", error: error.message });
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

    const order = await Order.findById(id)
      .populate("cartItems.productId")
      .populate("addressId");

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
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
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
