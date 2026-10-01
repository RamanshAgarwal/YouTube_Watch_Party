require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/database");
const roomService = require("./services/roomService");

const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({
    origin: CLIENT_URL,
    credentials: true
}));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST"]
    }
});

// Connect Database asynchronously
connectDB().then((connected) => {
    roomService.setDbConnected(connected);
});

app.get("/", (req, res) => {
    res.json({
        status: "online",
        name: "YouTube Watch Party API",
        db: roomService.dbConnected ? "connected" : "in-memory mode"
    });
});

// ===============================
// IN-MEMORY ROOM STORE
// ===============================
const rooms = {};

// ===============================
// HELPER FUNCTIONS
// ===============================

// Check if user has host or moderator privileges
function canControl(socket) {
    return socket.role === "host" || socket.role === "moderator";
}

// Calculate exact current video playback time
function getCurrentTime(room) {
    if (!room) return 0;

    if (room.isPlaying && room.startedAt !== null) {
        const elapsed = (Date.now() - room.startedAt) / 1000;
        return room.currentTime + elapsed;
    }

    return room.currentTime;
}

// Broadcast updated participant list to room
function sendParticipants(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const participants = Object.values(room.participants);
    io.to(roomId).emit("participants_updated", participants);

    // Asynchronously update DB metadata
    roomService.saveRoom(room);
}

// Send full room state snapshot to a client
function sendSyncState(socket, room) {
    socket.emit("sync_state", {
        videoId: room.videoId,
        currentTime: getCurrentTime(room),
        isPlaying: room.isPlaying,
        role: socket.role,
        hostId: room.hostId
    });
}

// ===============================
// SOCKET CONNECTION & HANDLERS
// ===============================

io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // -------------------------------
    // CREATE ROOM
    // -------------------------------
    socket.on("create_room", (data) => {
        let roomId;
        let username = "Host";

        if (typeof data === "string") {
            roomId = data;
        } else if (data && typeof data === "object") {
            roomId = data.roomId;
            username = data.username || "Host";
        }

        if (!roomId || typeof roomId !== "string") {
            socket.emit("room_error", "Invalid room code format");
            return;
        }

        const cleanRoomId = roomId.trim().toUpperCase();

        if (rooms[cleanRoomId]) {
            socket.emit("room_error", "Room already exists. Please choose another ID or join.");
            return;
        }

        rooms[cleanRoomId] = {
            roomId: cleanRoomId,
            videoId: null,
            currentTime: 0,
            isPlaying: false,
            startedAt: null,
            hostId: socket.id,
            participants: {},
            chatMessages: []
        };

        rooms[cleanRoomId].participants[socket.id] = {
            userId: socket.id,
            username: username,
            role: "host",
            joinedAt: new Date()
        };

        socket.join(cleanRoomId);
        socket.roomId = cleanRoomId;
        socket.role = "host";
        socket.username = username;

        console.log(`👑 ${username} created room: ${cleanRoomId}`);

        socket.emit("room_created", cleanRoomId);
        sendParticipants(cleanRoomId);
    });

    // -------------------------------
    // JOIN ROOM
    // -------------------------------
    socket.on("join_room", async (data) => {
        let roomId;
        let username = "Participant";

        if (typeof data === "string") {
            roomId = data;
        } else if (data && typeof data === "object") {
            roomId = data.roomId;
            username = data.username || "Participant";
        }

        if (!roomId) {
            socket.emit("room_error", "Please provide a valid Room ID");
            return;
        }

        const cleanRoomId = roomId.trim().toUpperCase();
        let room = rooms[cleanRoomId];

        // Fallback to database if server restarted
        if (!room && roomService.dbConnected) {
            const dbRoom = await roomService.getRoom(cleanRoomId);
            if (dbRoom) {
                rooms[cleanRoomId] = {
                    roomId: dbRoom.roomId,
                    videoId: dbRoom.videoId,
                    currentTime: dbRoom.currentTime,
                    isPlaying: dbRoom.isPlaying,
                    startedAt: dbRoom.startedAt,
                    hostId: socket.id, // Reassigning host if old host disconnected
                    participants: {},
                    chatMessages: []
                };
                room = rooms[cleanRoomId];
            }
        }

        if (!room) {
            socket.emit("room_error", "Room does not exist. Check the code and try again.");
            return;
        }

        socket.join(cleanRoomId);
        socket.roomId = cleanRoomId;
        socket.role = "participant";
        socket.username = username;

        room.participants[socket.id] = {
            userId: socket.id,
            username: username,
            role: "participant",
            joinedAt: new Date()
        };

        console.log(`👤 ${username} joined room: ${cleanRoomId}`);

        socket.emit("room_joined", cleanRoomId);
        sendSyncState(socket, room);
        sendParticipants(cleanRoomId);

        socket.to(cleanRoomId).emit("user_joined", {
            userId: socket.id,
            username: username,
            role: "participant"
        });
    });

    // -------------------------------
    // LOAD / CHANGE VIDEO
    // -------------------------------
    const handleVideoChange = (videoId) => {
        if (!canControl(socket)) {
            socket.emit("permission_denied", "Only Host or Moderator can change the video.");
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) {
            return;
        }

        const room = rooms[socket.roomId];
        room.videoId = videoId;
        room.currentTime = 0;
        room.isPlaying = false;
        room.startedAt = null;

        console.log(`🎬 ${socket.username} loaded video: ${videoId} in room ${socket.roomId}`);

        io.to(socket.roomId).emit("video_loaded", videoId);
        sendParticipants(socket.roomId);
    };

    socket.on("load_video", handleVideoChange);
    socket.on("change_video", handleVideoChange);

    // -------------------------------
    // PLAY VIDEO
    // -------------------------------
    socket.on("video_play", (time) => {
        if (!canControl(socket)) {
            socket.emit("permission_denied", "Participants cannot control video playback.");
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (typeof time === "number") {
            room.currentTime = time;
        }

        room.isPlaying = true;
        room.startedAt = Date.now();

        console.log(`▶ ${socket.username} played video at ${room.currentTime}s`);

        socket.to(socket.roomId).emit("video_play");
    });

    // -------------------------------
    // PAUSE VIDEO
    // -------------------------------
    socket.on("video_pause", (time) => {
        if (!canControl(socket)) {
            socket.emit("permission_denied", "Participants cannot control video playback.");
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (typeof time === "number") {
            room.currentTime = time;
        } else {
            room.currentTime = getCurrentTime(room);
        }

        room.isPlaying = false;
        room.startedAt = null;

        console.log(`⏸ ${socket.username} paused video at ${room.currentTime}s`);

        socket.to(socket.roomId).emit("video_pause");
    });

    // -------------------------------
    // SEEK VIDEO
    // -------------------------------
    socket.on("video_seek", (time) => {
        if (!canControl(socket)) {
            socket.emit("permission_denied", "Participants cannot seek the video.");
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (typeof time !== "number") return;

        room.currentTime = time;

        if (room.isPlaying) {
            room.startedAt = Date.now();
        }

        console.log(`⏩ ${socket.username} seeked to ${time}s`);

        socket.to(socket.roomId).emit("video_seek", time);
    });

    // -------------------------------
    // ASSIGN ROLE
    // -------------------------------
    socket.on("assign_role", ({ userId, role }) => {
        if (socket.role !== "host") {
            socket.emit("permission_denied", "Only Host can assign roles.");
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (!room.participants[userId]) return;

        if (role !== "moderator" && role !== "participant") return;

        room.participants[userId].role = role;

        const targetSocket = io.sockets.sockets.get(userId);
        if (targetSocket) {
            targetSocket.role = role;
        }

        console.log(`🛡️ Role of ${userId} changed to ${role}`);

        io.to(userId).emit("role_updated", role);
        sendParticipants(socket.roomId);
    });

    // -------------------------------
    // TRANSFER HOST (BONUS)
    // -------------------------------
    socket.on("transfer_host", (newHostUserId) => {
        if (socket.role !== "host") {
            socket.emit("permission_denied", "Only the current Host can transfer host privileges.");
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (!room.participants[newHostUserId] || newHostUserId === socket.id) {
            return;
        }

        // Previous host becomes moderator
        room.participants[socket.id].role = "moderator";
        socket.role = "moderator";

        // Target user becomes host
        room.participants[newHostUserId].role = "host";
        room.hostId = newHostUserId;

        const targetSocket = io.sockets.sockets.get(newHostUserId);
        if (targetSocket) {
            targetSocket.role = "host";
        }

        console.log(`👑 Host transferred from ${socket.username} to ${room.participants[newHostUserId].username}`);

        socket.emit("role_updated", "moderator");
        io.to(newHostUserId).emit("role_updated", "host");

        io.to(socket.roomId).emit("host_transferred", {
            newHostId: newHostUserId,
            newHostName: room.participants[newHostUserId].username
        });

        sendParticipants(socket.roomId);
    });

    // -------------------------------
    // REMOVE PARTICIPANT
    // -------------------------------
    socket.on("remove_participant", (userId) => {
        if (socket.role !== "host") {
            socket.emit("permission_denied", "Only Host can remove participants.");
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (userId === room.hostId) return;

        if (!room.participants[userId]) return;

        delete room.participants[userId];

        io.to(userId).emit("participant_removed");

        const targetSocket = io.sockets.sockets.get(userId);
        if (targetSocket) {
            targetSocket.leave(socket.roomId);
            targetSocket.roomId = null;
            targetSocket.role = null;
        }

        console.log(`❌ ${userId} removed from room ${socket.roomId}`);

        sendParticipants(socket.roomId);
    });

    // -------------------------------
    // LIVE ROOM CHAT (BONUS)
    // -------------------------------
    socket.on("send_chat_message", (text) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;

        if (typeof text !== "string" || !text.trim()) return;

        const room = rooms[socket.roomId];
        const messageData = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
            userId: socket.id,
            username: socket.username || "Anonymous",
            role: socket.role || "participant",
            message: text.trim().substring(0, 500),
            timestamp: new Date().toISOString()
        };

        room.chatMessages.push(messageData);
        if (room.chatMessages.length > 100) {
            room.chatMessages.shift();
        }

        io.to(socket.roomId).emit("chat_message", messageData);
    });

    // -------------------------------
    // EMOJI REACTIONS (BONUS)
    // -------------------------------
    socket.on("send_reaction", (emoji) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;

        const allowedEmojis = ["❤️", "🔥", "🎉", "😂", "👏", "👍"];
        if (!allowedEmojis.includes(emoji)) return;

        socket.to(socket.roomId).emit("reaction_received", {
            id: Date.now() + Math.random().toString(),
            emoji,
            username: socket.username
        });
    });

    // -------------------------------
    // DISCONNECT
    // -------------------------------
    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);

        const roomId = socket.roomId;
        if (!roomId || !rooms[roomId]) return;

        const room = rooms[roomId];

        delete room.participants[socket.id];

        socket.to(roomId).emit("user_left", socket.id);
        sendParticipants(roomId);

        // Auto host assignment if original host left
        if (socket.id === room.hostId) {
            const remainingParticipantIds = Object.keys(room.participants);

            if (remainingParticipantIds.length > 0) {
                const newHostId = remainingParticipantIds[0];
                room.hostId = newHostId;
                room.participants[newHostId].role = "host";

                const newHostSocket = io.sockets.sockets.get(newHostId);
                if (newHostSocket) {
                    newHostSocket.role = "host";
                }

                io.to(newHostId).emit("role_updated", "host");
                io.to(roomId).emit("host_transferred", {
                    newHostId: newHostId,
                    newHostName: room.participants[newHostId].username
                });

                sendParticipants(roomId);
            }
        }

        // Cleanup empty room
        if (Object.keys(room.participants).length === 0) {
            delete rooms[roomId];
            roomService.deleteRoom(roomId);
            console.log(`🧹 Room cleaned up: ${roomId}`);
        }
    });
});

// ===============================
// START SERVER
// ===============================
server.listen(PORT, () => {
    console.log(`🚀 Watch Party Server running on port ${PORT}`);
});