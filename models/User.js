const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    userName: {
        type: String,
        required: true,
        unique: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
        select: false,
    },
    role: {
        type: String,
        default: 'user'
    },
    avatar: {
        type: String,
        default: null
    },
    phone: {
        type: String,
        default: null,
        trim: true,
    },
    accountStatus: {
        type: String,
        enum: ["active", "blocked"],
        default: "active",
    },
    blockReason: {
        type: String,
        default: null,
        trim: true,
    },
    blockedAt: {
        type: Date,
        default: null,
    },
    blockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    unblockedAt: {
        type: Date,
        default: null,
    },
    unblockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    blockHistory: [{
        action: {
            type: String,
            enum: ["blocked", "unblocked"],
            required: true,
        },
        reason: {
            type: String,
            default: null,
        },
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    }],
    addresses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Address"
    }]
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);