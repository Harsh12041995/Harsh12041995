import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Whatsapp_automation';

export async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[DB] MongoDB Connected');
  } catch (err) {
    console.error('[DB] Connection Error:', err);
    process.exit(1);
  }
}
