import mongoose from 'mongoose';

const AccountSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  phoneNumber: { type: String },
  status: { type: String, default: 'starting' },
  provider: { type: String, default: 'ollama' },
  apiKey: { type: String, default: '' },
  model: { type: String, default: '' },
  defaultPrompt: { type: String, default: '' },
  qrCode: { type: String, default: null },
  lastActive: { type: Date, default: Date.now }
});

export const Account = mongoose.model('Account', AccountSchema);
