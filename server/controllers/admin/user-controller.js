const User = require('../../models/User');
const Order = require('../../models/Order');
const Review = require('../../models/Review');
const Address = require('../../models/Address');
const UserActivityLog = require('../../models/UserActivityLog');

// Lấy danh sách tất cả người dùng
exports.getAllUsers = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 100);
        const search = String(req.query.search || "").trim();
        const status = String(req.query.status || "all");
        const hasOrders = String(req.query.hasOrders || "all");
        const sort = String(req.query.sort || "createdAt");
        const order = req.query.order === "asc" ? 1 : -1;

        const match = { role: "user" };
        if (status === "active" || status === "blocked") {
            match.accountStatus = status;
        }
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const phoneMatches = await Address.find({
                phone: { $regex: escaped, $options: "i" },
            }).distinct("userId");
            match.$or = [
                { userName: { $regex: escaped, $options: "i" } },
                { email: { $regex: escaped, $options: "i" } },
                { phone: { $regex: escaped, $options: "i" } },
                { _id: { $in: phoneMatches } },
            ];
        }

        const pipeline = [
            { $match: match },
            {
                $lookup: {
                    from: "orders",
                    localField: "_id",
                    foreignField: "userId",
                    as: "orders",
                },
            },
            {
                $addFields: {
                    totalOrders: { $size: "$orders" },
                    totalSpent: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$orders",
                                        as: "order",
                                        cond: {
                                            $or: [
                                                { $eq: ["$$order.orderStatus", "delivered"] },
                                                { $eq: ["$$order.paymentStatus", "paid"] },
                                            ],
                                        },
                                    },
                                },
                                as: "paidOrder",
                                in: "$$paidOrder.totalAmount",
                            },
                        },
                    },
                    completedOrders: {
                        $size: {
                            $filter: {
                                input: "$orders",
                                as: "order",
                                cond: { $eq: ["$$order.orderStatus", "delivered"] },
                            },
                            pendingOrders: {
                                $size: {
                                    $filter: {
                                        input: "$orders",
                                        as: "order",
                                        cond: { $eq: ["$$order.orderStatus", "pending"] },
                                    },
                                },
                            },
                            pendingAmount: {
                                $sum: {
                                    $map: {
                                        input: {
                                            $filter: {
                                                input: "$orders",
                                                as: "order",
                                                cond: { $eq: ["$$order.orderStatus", "pending"] },
                                            },
                                        },
                                        as: "pendingOrder",
                                        in: "$$pendingOrder.totalAmount",
                                    },
                                },
                            },
                        },
                    },
                    cancelledOrders: {
                        $size: {
                            $filter: {
                                input: "$orders",
                                as: "order",
                                cond: { $eq: ["$$order.orderStatus", "rejected"] },
                            },
                        },
                    },
                },
            },
        ];

        if (hasOrders === "with") {
            pipeline.push({ $match: { totalOrders: { $gt: 0 } } });
        } else if (hasOrders === "without") {
            pipeline.push({ $match: { totalOrders: 0 } });
        }

        const sortStage = {
            createdAt: "createdAt",
            registeredAt: "createdAt",
            totalOrders: "totalOrders",
            totalSpent: "totalSpent",
            userName: "userName",
        }[sort] || "createdAt";

        pipeline.push({ $sort: { [sortStage]: order } });
        pipeline.push({
            $project: {
                password: 0,
                orders: 0,
            },
        });
        pipeline.push({
            $facet: {
                data: [
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                ],
                meta: [{ $count: "total" }],
            },
        });

        const [result] = await User.aggregate(pipeline);
        const data = result?.data || [];
        const total = result?.meta?.[0]?.total || 0;

        res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Tạo người dùng mới
exports.createUser = async (req, res) => {
    const user = new User({
        id: req.body.id,
        userName: req.body.userName,
        email: req.body.email,
        password: req.body.password,
        role: req.body.role,
        avatar: req.body.avatar
    });

    try {
        const newUser = await user.save();
        res.status(201).json(newUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// Cập nhật thông tin người dùng
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (user == null) {
            return res.status(404).json({ message: 'Cannot find user' });
        }
        if (user.role === "admin") {
            return res.status(403).json({
                success: false,
                message: "Không thể chỉnh sửa tài khoản quản trị viên.",
            });
        }

        if (req.body.userName != null) {
            user.userName = req.body.userName;
        }
        if (req.body.email != null) {
            user.email = req.body.email;
        }
        if (req.body.password != null) {
            user.password = req.body.password;
        }
        if (req.body.role != null) {
            user.role = req.body.role;
        }
        if (req.body.avatar != null) {
            user.avatar = req.body.avatar;
        }

        const updatedUser = await user.save();
        res.json(updatedUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const target = await User.findById(id);
        if (!target) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        }
        if (target.role === "admin") {
            return res.status(403).json({
                success: false,
                message: "Không thể xóa tài khoản quản trị viên.",
            });
        }

        const orders = await Order.find({ userId: id });

        if (orders.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete a user with existing orders.",
            });
        }

        await User.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "User deleted successfully.",
        });
    } catch (e) {
        console.log(e);
        res.status(500).json({
            success: false,
            message: "Some error occurred!",
        });
    }
};

exports.getUserDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        }
        if (user.role === "admin") {
            return res.status(403).json({
                success: false,
                message: "Tài khoản quản trị viên không thuộc quản lý khách hàng.",
            });
        }

        const [orders, reviews, addresses] = await Promise.all([
            Order.find({ userId: id })
                .populate("addressId")
                .populate("cartItems.productId")
                .sort({ orderDate: -1 }),
            Review.find({ userId: id }).sort({ createdAt: -1 }),
            Address.find({ userId: id }).sort({ createdAt: -1 }),
        ]);

        const totalSpent = orders
            .filter((order) =>
                order.orderStatus === "delivered" || order.paymentStatus === "paid"
            )
            .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
        const pendingOrders = orders.filter((order) => order.orderStatus === "pending");
        const pendingAmount = pendingOrders.reduce(
            (sum, order) => sum + Number(order.totalAmount || 0),
            0
        );

        res.json({
            success: true,
            data: {
                user,
                statistics: {
                    totalOrders: orders.length,
                    totalSpent,
                    completedOrders: orders.filter((order) => order.orderStatus === "delivered").length,
                    cancelledOrders: orders.filter((order) => order.orderStatus === "rejected").length,
                    totalReviews: reviews.length,
                    pendingOrders: pendingOrders.length,
                    pendingAmount,
                },
                orders,
                reviews,
                addresses,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.blockUser = async (req, res) => {
    try {
        const { id } = req.params;
        const reason = String(req.body.reason || "").trim();
        if (!reason) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập lý do khóa tài khoản." });
        }

        const target = await User.findById(id);
        if (!target) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        }
        if (target.role === "admin") {
            return res.status(403).json({ success: false, message: "Không thể khóa tài khoản quản trị viên." });
        }
        if (target.accountStatus === "blocked") {
            return res.status(400).json({ success: false, message: "Tài khoản đã ở trạng thái bị khóa." });
        }

        const now = new Date();
        target.accountStatus = "blocked";
        target.blockReason = reason;
        target.blockedAt = now;
        target.blockedBy = req.user.id;
        target.unblockedAt = null;
        target.unblockedBy = null;
        target.blockHistory.push({
            action: "blocked",
            reason,
            adminId: req.user.id,
            createdAt: now,
        });
        await target.save();

        await UserActivityLog.create({
            actorId: req.user.id,
            actorName: req.user.userName,
            targetUserId: target._id,
            action: "blocked",
            reason,
            result: "success",
        });

        res.json({
            success: true,
            message: "Đã khóa tài khoản.",
            data: await User.findById(target._id).select("-password"),
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.unblockUser = async (req, res) => {
    try {
        const { id } = req.params;
        const reason = String(req.body.reason || "").trim();
        const target = await User.findById(id);
        if (!target) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        }
        if (target.accountStatus !== "blocked") {
            return res.status(400).json({ success: false, message: "Tài khoản không đang bị khóa." });
        }

        const now = new Date();
        target.accountStatus = "active";
        target.blockReason = null;
        target.unblockedAt = now;
        target.unblockedBy = req.user.id;
        target.blockHistory.push({
            action: "unblocked",
            reason: reason || "Mở khóa tài khoản",
            adminId: req.user.id,
            createdAt: now,
        });
        await target.save();

        await UserActivityLog.create({
            actorId: req.user.id,
            actorName: req.user.userName,
            targetUserId: target._id,
            action: "unblocked",
            reason: reason || "Mở khóa tài khoản",
            result: "success",
        });

        res.json({
            success: true,
            message: "Đã mở khóa tài khoản.",
            data: await User.findById(target._id).select("-password"),
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getUserActivity = async (req, res) => {
    try {
        const target = await User.findById(req.params.id).select("role");
        if (!target) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        }
        if (target.role === "admin") {
            return res.status(403).json({
                success: false,
                message: "Tài khoản quản trị viên không thuộc quản lý khách hàng.",
            });
        }
        const logs = await UserActivityLog.find({ targetUserId: req.params.id })
            .sort({ createdAt: -1 })
            .limit(100);
        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};