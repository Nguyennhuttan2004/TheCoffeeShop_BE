const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose"); 
const User = require("../../models/User");

// register
const registerUser = async (req, res) => {
  const { userName, email, password } = req.body;

  // Kiểm tra xem tất cả các trường có được cung cấp không
  if (!userName || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo người dùng mới
    const newUser = new User({
      id: new mongoose.Types.ObjectId().toString(), // Tạo ID mới
      userName,
      email,
      password: hashedPassword,
      role: 'user', // Giá trị mặc định
      avatar: null  // Giá trị mặc định
    });

    // Lưu người dùng vào cơ sở dữ liệu
    await newUser.save();
    res.status(201).json({ message: "Đăng ký thành công" });
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(400).json({ message: "userName đã tồn tại" });
  }
};

//login
const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const checkUser = await User.findOne({ email }).select("+password");
    console.log({checkUser})
    if (!checkUser)
      return res.json({
        success: false,
        message: "Người dùng không tồn tại! Vui lòng đăng ký trước",
      });

    const checkPasswordMatch = await bcrypt.compare(
      password,
      checkUser.password
    );
    if (checkUser.accountStatus === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Tài khoản của bạn đã bị khóa.",
      });
    }
    if (!checkPasswordMatch)
      return res.json({
        success: false,
        message: "Sai password, vui long thu lai",
      });

    const token = jwt.sign(
      {
        id: checkUser._id,
        role: checkUser.role,
        email: checkUser.email,
        userName: checkUser.userName,
        avatar: checkUser?.avatar,
      },
      "CLIENT_SECRET_KEY",
      { expiresIn: "60m" }
    );

    res
      .cookie("token", token, {
        httpOnly: true, // Ngăn chặn truy cập từ JavaScript
        secure: false, // Đặt true nếu bạn sử dụng HTTPS
        sameSite: "Strict", // Ngăn chặn cookie được gửi trong các yêu cầu cross-site
      })
      .json({
        success: true,
        message: "Đăng nhập thành công",
        user: {
          email: checkUser.email,
          role: checkUser.role,
          id: checkUser._id,
          userName: checkUser.userName,
          avatar: checkUser?.avatar,
        },
      });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "xảy ra một số lỗi",
    });
  }
};

//logout
const logoutUser = (req, res) => {
  res.clearCookie("token").json({
    success: true,
    message: "Đăng xuất thành công!",
  });
};

// auth middleware
const authMiddleware = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token)
    return res.status(401).json({
      success: false,
      message: "Người dùng không hợp lệ!",
    });

  try {
    const decoded = jwt.verify(token, "CLIENT_SECRET_KEY");
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Tài khoản không tồn tại!",
      });
    }
    if (user.accountStatus === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Tài khoản của bạn đã bị khóa.",
      });
    }
    req.user = {
      id: user._id,
      role: user.role,
      email: user.email,
      userName: user.userName,
      avatar: user.avatar,
    };
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Người dùng không hợp lệ!",
    });
  }
};

const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền thực hiện thao tác này.",
    });
  }
  next();
};

const requireSelfMiddleware = (req, res, next) => {
  if (req.user.role === "admin") {
    return next();
  }
  const targetId =
    req.params.userId ||
    req.params.id ||
    req.body?.userId ||
    req.query?.userId;
  if (!targetId || String(targetId) !== String(req.user.id)) {
    return res.status(403).json({
      success: false,
      message: "Không có quyền truy cập tài nguyên này.",
    });
  }
  next();
};
//getTotalUsers
const getTotalUsers = async (req, res) => {
  try {
    const users = await User.find({}); // Fetch all users
    const totalUsers = users.length; // Total number of users
    const admins = users.filter(user => user.role === 'admin').length; // Count admins
    const regularUsers = users.filter(user => user.role === 'user').length; // Count regular users

    res.status(200).json({ totalUsers, admins, regularUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = { registerUser, loginUser, logoutUser, authMiddleware, adminMiddleware, requireSelfMiddleware, getTotalUsers };
