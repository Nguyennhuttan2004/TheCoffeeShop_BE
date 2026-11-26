require("dotenv").config();
const mongoose = require("mongoose");
const FAQ = require("../models/FAQ");

const faqs = [
  {
    question: "Quán nằm ở đâu?",
    answer: "The Coffee Shop ở Huflit Campus HocMon University.",
    keywords: ["địa chỉ", "ở đâu", "campus", "huflit"],
  },
  {
    question: "Quán mở cửa lúc nào?",
    answer: "Giờ mở cửa chưa được công bố trên hệ thống. Bạn gọi 1800-123-4567 để kiểm tra trước khi ghé.",
    keywords: ["mở cửa", "giờ hoạt động", "giờ mở", "mấy giờ"],
  },
  {
    question: "Liên hệ quán bằng cách nào?",
    answer: "Bạn gọi 1800-123-4567 hoặc gửi email info@example.com.",
    keywords: ["liên hệ", "số điện thoại", "hotline", "email"],
  },
  {
    question: "Có các phương thức thanh toán nào?",
    answer: "Hệ thống hỗ trợ thanh toán bằng tiền mặt, PayPal và MoMo.",
    keywords: ["thanh toán", "pay", "paypal", "momo", "tiền mặt"],
  },
  {
    question: "Chính sách giao hàng như thế nào?",
    answer: "Thông tin thời gian và phí giao hàng cụ thể chưa có trong hệ thống. Bạn vui lòng liên hệ nhân viên để được xác nhận.",
    keywords: ["giao hàng", "ship", "phí ship", "vận chuyển"],
  },
  {
    question: "Quy trình hủy đơn hoặc đổi trả?",
    answer: "Thông tin hủy đơn và đổi trả chưa được cấu hình trong FAQ. Vui lòng liên hệ nhân viên để được hỗ trợ theo từng đơn hàng.",
    keywords: ["hủy đơn", "đổi trả", "hoàn tiền", "hủy"],
  },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const faq of faqs) {
    await FAQ.updateOne(
      { question: faq.question },
      { $set: faq },
      { upsert: true }
    );
  }
  console.log(`Seeded ${faqs.length} chatbot FAQs`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
