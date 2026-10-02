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

// ===============================
// DATABASE CONNECTION
// ===============================

connectDB().then((connected) => {
    roomService.setDbConnected(connected);
});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        name: "YouTube Watch Party API",
        db: roomService.dbConnected ? "connected" : "in-memory mode"
    });
});

// ===============================
// IN-MEMORY ACTIVE ROOM STORE
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

// Save the latest room state to MongoDB
async function persistRoom(room) {
    if (!room) return;

    // When video is playing, store the exact current position
    // instead of the old position from when playback started.
    if (room.isPlaying) {
        room.currentTime = getCurrentTime(room);
        room.startedAt = Date.now();
    }

    await roomService.saveRoom(room);
}

// Broadcast updated participant list
function sendParticipants(roomId) {
    const room = rooms[roomId];

    if (!room) return;

    const participants = Object.values(room.participants);

    io.to(roomId).emit("participants_updated", participants);

    // Persist participant changes
    persistRoom(room).catch((error) => {
        console.error("❌ Failed to persist room:", error.message);
    });
}

// Send complete room state to a client
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
// SOCKET CONNECTION
// ===============================

io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // ===============================
    // CREATE ROOM
    // ===============================

    socket.on("create_room", async (data) => {
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

        // Check active in-memory room
        if (rooms[cleanRoomId]) {
            socket.emit(
                "room_error",
                "Room already exists. Please choose another ID or join."
            );
            return;
        }

        // Check MongoDB too
        if (roomService.dbConnected) {
            const existingRoom = await roomService.getRoom(cleanRoomId);

            if (existingRoom) {
                socket.emit(
                    "room_error",
                    "Room already exists. Please choose another ID or join."
                );
                return;
            }
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

    // ===============================
    // JOIN ROOM
    // ===============================

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

        // ===============================
        // RECOVER ROOM FROM DATABASE
        // ===============================

        if (!room && roomService.dbConnected) {
            const dbRoom = await roomService.getRoom(cleanRoomId);

            if (dbRoom) {
                /*
                 * Socket IDs from a previous server session are no longer valid.
                 * Therefore, the first person recovering a persisted room becomes
                 * the new host.
                 */

                rooms[cleanRoomId] = {
                    roomId: dbRoom.roomId,
                    videoId: dbRoom.videoId,
                    currentTime: dbRoom.currentTime,
                    isPlaying: dbRoom.isPlaying,
                    startedAt: dbRoom.startedAt,
                    hostId: socket.id,
                    participants: {},
                    chatMessages: []
                };

                room = rooms[cleanRoomId];

                // The room is being brought back into the active memory store.
                // Reset playback timer if it was playing while server was offline.
                if (room.isPlaying) {
                    room.isPlaying = false;
                    room.startedAt = null;
                }

                console.log(`♻️ Room recovered from MongoDB: ${cleanRoomId}`);
            }
        }

        if (!room) {
            socket.emit(
                "room_error",
                "Room does not exist. Check the code and try again."
            );
            return;
        }

        socket.join(cleanRoomId);
        socket.roomId = cleanRoomId;

        // If this is a recovered room, first user becomes host.
        if (room.hostId === socket.id) {
            socket.role = "host";
        } else {
            socket.role = "participant";
        }

        socket.username = username;

        room.participants[socket.id] = {
            userId: socket.id,
            username: username,
            role: socket.role,
            joinedAt: new Date()
        };

        console.log(
            `👤 ${username} joined room: ${cleanRoomId} as ${socket.role}`
        );

        socket.emit("room_joined", cleanRoomId);

        sendSyncState(socket, room);

        sendParticipants(cleanRoomId);

        socket.to(cleanRoomId).emit("user_joined", {
            userId: socket.id,
            username: username,
            role: socket.role
        });
    });

    // ===============================
    // LOAD / CHANGE VIDEO
    // ===============================

    const handleVideoChange = async (videoId) => {
        if (!canControl(socket)) {
            socket.emit(
                "permission_denied",
                "Only Host or Moderator can change the video."
            );
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) {
            return;
        }

        if (typeof videoId !== "string" || !videoId.trim()) {
            return;
        }

        const room = rooms[socket.roomId];

        room.videoId = videoId;
        room.currentTime = 0;
        room.isPlaying = false;
        room.startedAt = null;

        console.log(
            `🎬 ${socket.username} loaded video: ${videoId} in room ${socket.roomId}`
        );

        io.to(socket.roomId).emit("video_loaded", videoId);

        await persistRoom(room);

        sendParticipants(socket.roomId);
    };

    socket.on("load_video", handleVideoChange);
    socket.on("change_video", handleVideoChange);

    // ===============================
    // PLAY VIDEO
    // ===============================

    socket.on("video_play", async (time) => {
        if (!canControl(socket)) {
            socket.emit(
                "permission_denied",
                "Participants cannot control video playback."
            );
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (typeof time === "number") {
            room.currentTime = time;
        }

        room.isPlaying = true;
        room.startedAt = Date.now();

        console.log(
            `▶ ${socket.username} played video at ${room.currentTime}s`
        );

        socket.to(socket.roomId).emit("video_play");

        await persistRoom(room);
    });

    // ===============================
    // PAUSE VIDEO
    // ===============================

    socket.on("video_pause", async (time) => {
        if (!canControl(socket)) {
            socket.emit(
                "permission_denied",
                "Participants cannot control video playback."
            );
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

        console.log(
            `⏸ ${socket.username} paused video at ${room.currentTime}s`
        );

        socket.to(socket.roomId).emit("video_pause");

        await persistRoom(room);
    });

    // ===============================
    // SEEK VIDEO
    // ===============================

    socket.on("video_seek", async (time) => {
        if (!canControl(socket)) {
            socket.emit(
                "permission_denied",
                "Participants cannot seek the video."
            );
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (typeof time !== "number") return;

        room.currentTime = time;

        if (room.isPlaying) {
            room.startedAt = Date.now();
        }

        console.log(
            `⏩ ${socket.username} seeked to ${time}s`
        );

        socket.to(socket.roomId).emit("video_seek", time);

        await persistRoom(room);
    });

    // ===============================
    // ASSIGN ROLE
    // ===============================

    socket.on("assign_role", async ({ userId, role }) => {
        if (socket.role !== "host") {
            socket.emit(
                "permission_denied",
                "Only Host can assign roles."
            );
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

        await persistRoom(room);

        sendParticipants(socket.roomId);
    });

    // ===============================
    // TRANSFER HOST
    // ===============================

    socket.on("transfer_host", async (newHostUserId) => {
        if (socket.role !== "host") {
            socket.emit(
                "permission_denied",
                "Only the current Host can transfer host privileges."
            );
            return;
        }

        if (!socket.roomId || !rooms[socket.roomId]) return;

        const room = rooms[socket.roomId];

        if (
            !room.participants[newHostUserId] ||
            newHostUserId === socket.id
        ) {
            return;
        }

        // Previous host becomes moderator
        room.participants[socket.id].role = "moderator";
        socket.role = "moderator";

        // New host
        room.participants[newHostUserId].role = "host";
        room.hostId = newHostUserId;

        const targetSocket = io.sockets.sockets.get(newHostUserId);

        if (targetSocket) {
            targetSocket.role = "host";
        }

        console.log(
            `👑 Host transferred from ${socket.username} to ${room.participants[newHostUserId].username}`
        );

        socket.emit("role_updated", "moderator");

        io.to(newHostUserId).emit("role_updated", "host");

        io.to(socket.roomId).emit("host_transferred", {
            newHostId: newHostUserId,
            newHostName: room.participants[newHostUserId].username
        });

        await persistRoom(room);

        sendParticipants(socket.roomId);
    });

    // ===============================
    // REMOVE PARTICIPANT
    // ===============================

    socket.on("remove_participant", async (userId) => {
        if (socket.role !== "host") {
            socket.emit(
                "permission_denied",
                "Only Host can remove participants."
            );
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

        console.log(
            `❌ ${userId} removed from room ${socket.roomId}`
        );

        await persistRoom(room);

        sendParticipants(socket.roomId);
    });

    // ===============================
    // LIVE ROOM CHAT
    // ===============================

    socket.on("send_chat_message", (text) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;

        if (typeof text !== "string" || !text.trim()) return;

        const room = rooms[socket.roomId];

        const messageData = {
            id:
                Date.now().toString() +
                Math.random().toString(36).substr(2, 4),

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

    // ===============================
    // EMOJI REACTIONS
    // ===============================

    socket.on("send_reaction", (emoji) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;

        const allowedEmojis = [
            "❤️",
            "🔥",
            "🎉",
            "😂",
            "👏",
            "👍"
        ];

        if (!allowedEmojis.includes(emoji)) return;

        socket.to(socket.roomId).emit("reaction_received", {
            id: Date.now() + Math.random().toString(),
            emoji,
            username: socket.username
        });
    });

    // ===============================
    // DISCONNECT
    // ===============================

    socket.on("disconnect", async () => {
        console.log(`❌ User disconnected: ${socket.id}`);

        const roomId = socket.roomId;

        if (!roomId || !rooms[roomId]) return;

        const room = rooms[roomId];

        delete room.participants[socket.id];

        socket.to(roomId).emit("user_left", socket.id);

        // ===============================
        // HOST LEFT
        // ===============================

        if (socket.id === room.hostId) {
            const remainingParticipantIds =
                Object.keys(room.participants);

            if (remainingParticipantIds.length > 0) {
                const newHostId = remainingParticipantIds[0];

                room.hostId = newHostId;

                room.participants[newHostId].role = "host";

                const newHostSocket =
                    io.sockets.sockets.get(newHostId);

                if (newHostSocket) {
                    newHostSocket.role = "host";
                }

                io.to(newHostId).emit(
                    "role_updated",
                    "host"
                );

                io.to(roomId).emit("host_transferred", {
                    newHostId: newHostId,
                    newHostName:
                        room.participants[newHostId].username
                });

                console.log(
                    `👑 New host: ${room.participants[newHostId].username}`
                );
            }
        }

        // ===============================
        // ROOM EMPTY
        // ===============================

        if (Object.keys(room.participants).length === 0) {
            delete rooms[roomId];

            await roomService.deleteRoom(roomId);

            console.log(`🧹 Room cleaned up: ${roomId}`);

            return;
        }

        // Persist remaining participants / host
        await persistRoom(room);

        io.to(roomId).emit(
            "participants_updated",
            Object.values(room.participants)
        );
    });
});

// ===============================
// START SERVER
// ===============================

server.listen(PORT, () => {
    console.log(
        `🚀 Watch Party Server running on port ${PORT}`
    );
});