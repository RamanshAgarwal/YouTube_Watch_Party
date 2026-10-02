const Room = require("../models/Room");

class RoomService {
    constructor() {
        this.dbConnected = false;
    }

    setDbConnected(status) {
        this.dbConnected = status;
    }

    async saveRoom(roomData) {
        if (!this.dbConnected) return;

        try {
            const participantsArray = Object.values(roomData.participants || {});
            
            await Room.findOneAndUpdate(
                { roomId: roomData.roomId },
                {
                    roomId: roomData.roomId,
                    hostId: roomData.hostId,
                    videoId: roomData.videoId,
                    currentTime: roomData.currentTime,
                    isPlaying: roomData.isPlaying,
                    startedAt: roomData.startedAt,
                    participants: participantsArray,
                    lastActive: new Date()
                },
                { upsert: true, returnDocument: "after" }
            );
        } catch (error) {
            console.error(`Error saving room ${roomData.roomId} to DB:`, error.message);
        }
    }

    async deleteRoom(roomId) {
        if (!this.dbConnected) return;

        try {
            await Room.deleteOne({ roomId });
        } catch (error) {
            console.error(`Error deleting room ${roomId} from DB:`, error.message);
        }
    }

    async getRoom(roomId) {
        if (!this.dbConnected) return null;

        try {
            return await Room.findOne({ roomId });
        } catch (error) {
            console.error(`Error fetching room ${roomId} from DB:`, error.message);
            return null;
        }
    }
}

module.exports = new RoomService();
