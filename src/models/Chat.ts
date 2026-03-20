import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  accountId: { type: String, required: true },
  from: { type: String, required: true },
  body: { type: String, required: true },
  reply: { type: String, required: true },
  model: { type: String, required: true },
  ts: { type: Date, default: Date.now }
});

export const Chat = mongoose.model('Chat', ChatSchema);
