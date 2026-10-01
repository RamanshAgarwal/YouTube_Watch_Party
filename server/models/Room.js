const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    role: { 
        type: String, 
        enum: ["host", "moderator", "participant"], 
        default: "participant" 
    },
    joinedAt: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true, index: true },
    hostId: { type: String, required: true },
    videoId: { type: String, default: null },
    currentTime: { type: Number, default: 0 },
    isPlaying: { type: Boolean, default: false },
    startedAt: { type: Number, default: null },
    participants: [participantSchema],
    lastActive: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = mongoose.model("Room", roomSchema);
