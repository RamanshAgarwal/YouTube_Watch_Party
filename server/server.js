const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173"
    }
});

app.get("/", (req, res) => {
    res.send("Watch Party Server Running");
});

// ===============================
// ROOMS
// ===============================

const rooms = {};


// ===============================
// HELPER FUNCTIONS
// ===============================

function canControl(socket) {
    return (
        socket.role === "host" ||
        socket.role === "moderator"
    );
}


// Get the actual current video time
// If video is playing, calculate elapsed time
function getCurrentTime(room) {
    if (!room) {
        return 0;
    }

    if (
        room.isPlaying &&
        room.startedAt !== null
    ) {
        const elapsed =
            (Date.now() - room.startedAt) / 1000;

        return room.currentTime + elapsed;
    }

    return room.currentTime;
}


// Send participants list to everyone
function sendParticipants(roomId) {
    const room = rooms[roomId];

    if (!room) {
        return;
    }

    const participants =
        Object.values(room.participants);

    io.to(roomId).emit(
        "participants_updated",
        participants
    );
}


// Send complete current state
function sendSyncState(socket, room) {
    socket.emit("sync_state", {
        videoId: room.videoId,
        currentTime: getCurrentTime(room),
        isPlaying: room.isPlaying,
        role: socket.role
    });
}


// ===============================
// SOCKET CONNECTION
// ===============================

io.on("connection", (socket) => {

    console.log(
        "User connected:",
        socket.id
    );


    // =================================
    // CREATE ROOM
    // =================================

    socket.on("create_room", (data) => {

        let roomId;
        let username = "Host";

        if (typeof data === "string") {

            roomId = data;

        } else {

            roomId = data.roomId;
            username =
                data.username || "Host";

        }


        if (!roomId) {
            return;
        }


        // Prevent duplicate room
        if (rooms[roomId]) {

            socket.emit(
                "room_error",
                "Room already exists"
            );

            return;
        }


        // Create room
        rooms[roomId] = {

            videoId: null,

            currentTime: 0,

            isPlaying: false,

            // Time when playback started
            startedAt: null,

            // Host socket id
            hostId: socket.id,

            // All participants
            participants: {}

        };


        // Add host
        rooms[roomId].participants[
            socket.id
        ] = {

            userId: socket.id,

            username: username,

            role: "host"

        };


        // Join socket room
        socket.join(roomId);


        // Save socket information
        socket.roomId = roomId;

        socket.role = "host";

        socket.username = username;


        console.log(
            `${username} created room: ${roomId}`
        );


        // Tell host room was created
        socket.emit(
            "room_created",
            roomId
        );


        // Send participant list
        sendParticipants(roomId);

    });


    // =================================
    // JOIN ROOM
    // =================================

    socket.on("join_room", (data) => {

        let roomId;
        let username = "Participant";

        if (typeof data === "string") {

            roomId = data;

        } else {

            roomId = data.roomId;

            username =
                data.username ||
                "Participant";

        }


        // Check room
        if (!rooms[roomId]) {

            socket.emit(
                "room_error",
                "Room does not exist"
            );

            return;
        }


        const room = rooms[roomId];


        // Join socket room
        socket.join(roomId);


        // Save socket information
        socket.roomId = roomId;

        socket.role = "participant";

        socket.username = username;


        // Add participant
        room.participants[
            socket.id
        ] = {

            userId: socket.id,

            username: username,

            role: "participant"

        };


        console.log(
            `${username} joined room: ${roomId}`
        );


        // Tell client
        socket.emit(
            "room_joined",
            roomId
        );


        // IMPORTANT:
        // Send current complete state
        sendSyncState(
            socket,
            room
        );


        // Update everyone
        sendParticipants(roomId);


        // Tell existing users
        socket.to(roomId).emit(
            "user_joined",
            {
                userId: socket.id,
                username: username,
                role: "participant"
            }
        );

    });


    // =================================
    // LOAD VIDEO
    // =================================

    socket.on(
        "load_video",
        (videoId) => {

            if (!canControl(socket)) {

                socket.emit(
                    "permission_denied",
                    "You cannot change the video"
                );

                return;
            }


            if (!socket.roomId) {
                return;
            }


            const room =
                rooms[socket.roomId];


            if (!room) {
                return;
            }


            room.videoId = videoId;

            room.currentTime = 0;

            room.isPlaying = false;

            room.startedAt = null;


            console.log(
                `${socket.username} loaded video: ${videoId}`
            );


            socket.to(
                socket.roomId
            ).emit(
                "video_loaded",
                videoId
            );

        }
    );


    // =================================
    // CHANGE VIDEO
    // =================================

    socket.on(
        "change_video",
        (videoId) => {

            if (!canControl(socket)) {

                socket.emit(
                    "permission_denied",
                    "You cannot change the video"
                );

                return;
            }


            if (!socket.roomId) {
                return;
            }


            const room =
                rooms[socket.roomId];


            if (!room) {
                return;
            }


            room.videoId = videoId;

            room.currentTime = 0;

            room.isPlaying = false;

            room.startedAt = null;


            console.log(
                `${socket.username} changed video: ${videoId}`
            );


            socket.to(
                socket.roomId
            ).emit(
                "video_loaded",
                videoId
            );

        }
    );


    // =================================
    // PLAY VIDEO
    // =================================

    socket.on(
        "video_play",
        (time) => {

            if (!canControl(socket)) {

                socket.emit(
                    "permission_denied",
                    "You cannot control the video"
                );

                return;
            }


            if (!socket.roomId) {
                return;
            }


            const room =
                rooms[socket.roomId];


            if (!room) {
                return;
            }


            // Save exact position
            if (
                typeof time === "number"
            ) {

                room.currentTime = time;

            }


            // Start timing
            room.isPlaying = true;

            room.startedAt = Date.now();


            console.log(
                `${socket.username} played video at ${room.currentTime}`
            );


            // Send to everyone except sender
            socket.to(
                socket.roomId
            ).emit(
                "video_play"
            );

        }
    );


    // =================================
    // PAUSE VIDEO
    // =================================

    socket.on(
        "video_pause",
        (time) => {

            if (!canControl(socket)) {

                socket.emit(
                    "permission_denied",
                    "You cannot control the video"
                );

                return;
            }


            if (!socket.roomId) {
                return;
            }


            const room =
                rooms[socket.roomId];


            if (!room) {
                return;
            }


            // Save exact pause position
            if (
                typeof time === "number"
            ) {

                room.currentTime = time;

            } else {

                room.currentTime =
                    getCurrentTime(room);

            }


            // Stop timing
            room.isPlaying = false;

            room.startedAt = null;


            console.log(
                `${socket.username} paused video at ${room.currentTime}`
            );


            // Send to everyone except sender
            socket.to(
                socket.roomId
            ).emit(
                "video_pause"
            );

        }
    );


    // =================================
    // SEEK VIDEO
    // =================================

    socket.on(
        "video_seek",
        (time) => {

            if (!canControl(socket)) {

                socket.emit(
                    "permission_denied",
                    "You cannot control the video"
                );

                return;
            }


            if (!socket.roomId) {
                return;
            }


            const room =
                rooms[socket.roomId];


            if (!room) {
                return;
            }


            if (
                typeof time !== "number"
            ) {
                return;
            }


            room.currentTime = time;


            // If video is currently playing,
            // restart elapsed-time calculation
            if (room.isPlaying) {

                room.startedAt =
                    Date.now();

            }


            console.log(
                `${socket.username} seeked to ${time}`
            );


            socket.to(
                socket.roomId
            ).emit(
                "video_seek",
                time
            );

        }
    );


    // =================================
    // ASSIGN ROLE
    // =================================

    socket.on(
        "assign_role",
        ({ userId, role }) => {

            // Only host
            if (
                socket.role !== "host"
            ) {

                socket.emit(
                    "permission_denied",
                    "Only host can assign roles"
                );

                return;
            }


            if (!socket.roomId) {
                return;
            }


            const room =
                rooms[socket.roomId];


            if (!room) {
                return;
            }


            // User exists?
            if (
                !room.participants[userId]
            ) {
                return;
            }


            // Allowed roles
            if (
                role !== "moderator" &&
                role !== "participant"
            ) {
                return;
            }


            // Update room participant
            room.participants[
                userId
            ].role = role;


            console.log(
                `${userId} role changed to ${role}`
            );


            // Update actual socket role
            const targetSocket =
                io.sockets.sockets.get(
                    userId
                );


            if (targetSocket) {

                targetSocket.role =
                    role;

            }


            // Tell target user
            io.to(userId).emit(
                "role_updated",
                role
            );


            // Update everyone
            sendParticipants(
                socket.roomId
            );

        }
    );


    // =================================
    // REMOVE PARTICIPANT
    // =================================

    socket.on(
        "remove_participant",
        (userId) => {

            // Only host
            if (
                socket.role !== "host"
            ) {

                socket.emit(
                    "permission_denied",
                    "Only host can remove participants"
                );

                return;
            }


            if (!socket.roomId) {
                return;
            }


            const room =
                rooms[socket.roomId];


            if (!room) {
                return;
            }


            // Host cannot remove himself
            if (
                userId === room.hostId
            ) {
                return;
            }


            // Check participant
            if (
                !room.participants[userId]
            ) {
                return;
            }


            // Remove from room data
            delete room.participants[
                userId
            ];


            // Tell removed user
            io.to(userId).emit(
                "participant_removed"
            );


            // Get socket
            const targetSocket =
                io.sockets.sockets.get(
                    userId
                );


            if (targetSocket) {

                targetSocket.leave(
                    socket.roomId
                );

                targetSocket.roomId =
                    null;

                targetSocket.role =
                    null;

            }


            console.log(
                `${userId} removed from room ${socket.roomId}`
            );


            // Update participants
            sendParticipants(
                socket.roomId
            );

        }
    );


    // =================================
    // DISCONNECT
    // =================================

    socket.on("disconnect", () => {

        console.log(
            "User disconnected:",
            socket.id
        );


        const roomId =
            socket.roomId;


        if (!roomId) {
            return;
        }


        const room =
            rooms[roomId];


        if (!room) {
            return;
        }


        // Remove participant
        delete room.participants[
            socket.id
        ];


        // Tell others
        socket.to(roomId).emit(
            "user_left",
            socket.id
        );


        // Update list
        sendParticipants(
            roomId
        );


        // If host disconnects
        if (
            socket.id === room.hostId
        ) {

            console.log(
                `Host disconnected from room ${roomId}`
            );

            /*
             * For now we keep the room alive.
             * Host transfer can be added later.
             */

        }


        // Delete empty room
        if (
            Object.keys(
                room.participants
            ).length === 0
        ) {

            delete rooms[roomId];

            console.log(
                `Room deleted: ${roomId}`
            );

        }

    });

});


// ===============================
// START SERVER
// ===============================

server.listen(
    5000,
    () => {

        console.log(
            "Server running on port 5000"
        );

    }
);