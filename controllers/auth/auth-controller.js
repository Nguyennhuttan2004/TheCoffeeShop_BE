const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../../models/User");

const getAvatarUrl = (avatar) => {
  if (!avatar) return null;
  return avatar.startsWith("/") ? avatar : `/images/${avatar}`;
};

const authCookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  sameSite:
    process.env.COOKIE_SAME_SITE ||
    (process.env.NODE_ENV === "production" ? "none" : "lax"),
  path: "/",
  maxAge: 60 * 60 * 1000,
};

const registerUser = async (req, res) => {
  const { userName, email, password } = req.body;

  if (!userName || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      id: new mongoose.Types.ObjectId().toString(),
      userName,
      email,
      password: hashedPassword,
      role: "user",
      avatar: null,
    });

    await newUser.save();
    res.status(201).json({ message: "Đăng ký thành công" });
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(400).json({ message: "userName đã tồn tại" });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const checkUser = await User.findOne({ email });
    if (!checkUser) {
      return res.json({
        success: false,
        message: "Người dùng không tồn tại! Vui lòng đăng ký trước",
      });
    }

    const checkPasswordMatch = await bcrypt.compare(password, checkUser.password);
    if (!checkPasswordMatch) {
      return res.json({
        success: false,
        message: "Sai password, vui long thu lai",
      });
    }

    const token = jwt.sign(
      {
        id: checkUser._id,
        role: checkUser.role,
        email: checkUser.email,
        userName: checkUser.userName,
        avatar: getAvatarUrl(checkUser.avatar),
      },
      "CLIENT_SECRET_KEY",
      { expiresIn: "60m" }
    );

    res.cookie("token", token, authCookieOptions).json({
      success: true,
      message: "Đăng nhập thành công",
      user: {
        email: checkUser.email,
        role: checkUser.role,
        id: checkUser._id,
        userName: checkUser.userName,
        avatar: getAvatarUrl(checkUser.avatar),
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

const logoutUser = (req, res) => {
  res.clearCookie("token", authCookieOptions).json({
    success: true,
    message: "Đăng xuất thành công!",
  });
};

const authMiddleware = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Người dùng không hợp lệ!",
    });
  }

  try {
    const decoded = jwt.verify(token, "CLIENT_SECRET_KEY");
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Tài khoản không tồn tại!",
      });
    }

    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
      userName: user.userName,
      avatar: getAvatarUrl(user.avatar),
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Người dùng không hợp lệ!",
    });
  }
};

const getTotalUsers = async (req, res) => {
  try {
    const users = await User.find({});
    const totalUsers = users.length;
    const admins = users.filter((user) => user.role === "admin").length;
    const regularUsers = users.filter((user) => user.role === "user").length;

    res.status(200).json({ totalUsers, admins, regularUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  authMiddleware,
  getTotalUsers,
};
