const mongoose = require("mongoose");

const connectDB = async () => {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
        console.log("ℹ️ MONGODB_URI not provided in environment. Running with in-memory room store.");
        return false;
    }

    try {
        const conn = await mongoose.connect(mongoURI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return true;
    } catch (error) {
        console.error(`⚠️ MongoDB Connection Failed: ${error.message}`);
        console.log("ℹ️ Falling back to in-memory room state.");
        return false;
    }
};

module.exports = connectDB;
