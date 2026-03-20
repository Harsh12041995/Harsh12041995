import mongoose from 'mongoose';

const ContactSchema = new mongoose.Schema({
  accountId: { type: String, required: true },
  contactId: { type: String, required: true },
  prompt: { type: String, default: '' },
  context: { type: String, default: '' }
});

ContactSchema.index({ accountId: 1, contactId: 1 }, { unique: true });

export const Contact = mongoose.model('Contact', ContactSchema);
