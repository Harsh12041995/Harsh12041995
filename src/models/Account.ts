import mongoose from 'mongoose';

const AccountSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  phoneNumber: { type: String },
  status: { type: String, default: 'starting' },
  defaultPrompt: { type: String, default: '' },
  lastActive: { type: Date, default: Date.now }
});

export const Account = mongoose.model('Account', AccountSchema);
