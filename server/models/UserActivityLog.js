const mongoose = require("mongoose");

const UserActivityLogSchema = new mongoose.Schema({
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    actorName: {
        type: String,
        default: null,
    },
    targetUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    action: {
        type: String,
        enum: ["blocked", "unblocked"],
        required: true,
    },
    reason: {
        type: String,
        default: null,
    },
    result: {
        type: String,
        enum: ["success", "failed"],
        default: "success",
    },
}, { timestamps: true });

module.exports = mongoose.model("UserActivityLog", UserActivityLogSchema);
