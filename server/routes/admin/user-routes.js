const express = require('express');
const router = express.Router();
const userController = require('../../controllers/admin/user-controller.js');
const { authMiddleware, adminMiddleware } = require('../../controllers/auth/auth-controller');

router.use(authMiddleware, adminMiddleware);

// Lấy danh sách tất cả người dùng
router.get('/', userController.getAllUsers);

// Tạo người dùng mới
router.post('/', userController.createUser);

// Cập nhật thông tin người dùng
router.put('/:id', userController.updateUser);

// Xóa người dùng
router.delete('/:id', userController.deleteUser);
router.get('/:id/detail', userController.getUserDetail);
router.get('/:id/activity', userController.getUserActivity);
router.post('/:id/block', userController.blockUser);
router.post('/:id/unblock', userController.unblockUser);

module.exports = router;