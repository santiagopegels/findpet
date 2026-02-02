const mongoose = require('mongoose');

const dbConnection = async () => {
    try {
        const connectionOptions = {
            maxPoolSize: 10, // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
            family: 4 // Use IPv4, skip trying IPv6
        };

        await mongoose.connect(process.env.MONGO_DB_CONNECTION, connectionOptions);

        // Log successful connection
        console.log('✅ MongoDB connected successfully');

        // Event listeners for connection states
        mongoose.connection.on('error', (error) => {
            console.error('❌ MongoDB connection error:', error);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 MongoDB reconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('📴 MongoDB connection closed due to app termination');
        });

    } catch (error) {
        console.error('💥 Failed to connect to MongoDB:', error.message);
        throw error; // Re-throw to be handled by the caller
    }
};

module.exports = {
    dbConnection
};