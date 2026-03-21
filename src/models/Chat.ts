import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  accountId: { type: String, required: true },
  from: { type: String, required: true },
  body: { type: String, required: true },
  reply: { type: String, default: '' },
  model: { type: String, required: true },
  needsApproval: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },
  draftReply: { type: String, default: '' },
  ts: { type: Date, default: Date.now }
});

// ✅ Task 3.1 — Index for fast contact history queries (accountId + contact + time)
ChatSchema.index({ accountId: 1, from: 1, ts: -1 });

export const Chat = mongoose.model('Chat', ChatSchema);
