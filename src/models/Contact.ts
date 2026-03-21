import mongoose from 'mongoose';

const ContactSchema = new mongoose.Schema({
  accountId:  { type: String, required: true },
  contactId:  { type: String, required: true },
  name:       { type: String, default: '' },
  pushname:   { type: String, default: '' },
  prompt:     { type: String, default: '' },
  context:    { type: String, default: '' },
  isAiEnabled: { type: Boolean, default: true },
  chatStyle:  { type: String, default: 'friendly' },
  // ✅ Task 4.3 — Track recency for sorting contact list by most recent activity
  lastMessageAt: { type: Date, default: null }
});

ContactSchema.index({ accountId: 1, contactId: 1 }, { unique: true });

export const Contact = mongoose.model('Contact', ContactSchema);
