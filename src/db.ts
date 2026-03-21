import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Whatsapp_automation';

export async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,   // Timeout after 5s if can't reach DB
      heartbeatFrequencyMS: 10000,      // Check connection health every 10s
    });
    console.log('[DB] MongoDB Connected');

    // ✅ Task 3.4 — Handle reconnection gracefully without crashing
    mongoose.connection.on('disconnected', () =>
      console.warn('[DB] Connection lost. MongoDB is trying to reconnect...')
    );
    mongoose.connection.on('reconnected', () =>
      console.log('[DB] Reconnected to MongoDB.')
    );
  } catch (err) {
    console.error('[DB] Connection Error:', err);
    process.exit(1);
  }
}
