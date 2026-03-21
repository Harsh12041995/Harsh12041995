import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import { ProviderManager } from './ai/manager';
import { ProviderType } from './ai/types';
import { Chat } from './models/Chat';
import { Contact } from './models/Contact';
import { Account } from './models/Account';

const app = express();
const httpServer = createServer(app);
export const io = new SocketIO(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

let aiService: ProviderManager | null = null;
let refreshQrHandler: ((sessionId: string) => Promise<void>) | null = null;
let logoutHandler: ((sessionId: string) => Promise<void>) | null = null;
let createAccountHandler: ((sessionId: string) => Promise<void>) | null = null;

export function registerLogoutHandler(handler: (sessionId: string) => Promise<void>): void {
  logoutHandler = handler;
}

export function registerCreateAccountHandler(handler: (sessionId: string) => Promise<void>): void {
  createAccountHandler = handler;
}


// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/messages', async (req, res) => {
  const { accountId } = req.query;
  const filter = accountId ? { accountId } : {};
  const messages = await Chat.find(filter).sort({ ts: -1 }).limit(100);
  res.json(messages.reverse());
});

app.get('/api/contacts', async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) return res.json([]);
  
  // Get all contacts from the Contact model for this account
  const contacts = await Contact.find({ accountId });
  
  // Also check Chat history for any contacts not yet in the Contact model
  const chatContactIds = await Chat.distinct('from', { accountId });
  const existingContactIds = new Set(contacts.map(c => c.contactId));
  
  const missingContactIds = chatContactIds.filter(id => !existingContactIds.has(id));
  
  // Create basic Contact entries for missing IDs (will be enriched later)
  for (const id of missingContactIds) {
    const newContact = await Contact.create({ accountId, contactId: id });
    (contacts as any).push(newContact);
  }

  return res.json(contacts);
});

app.get('/api/accounts', async (_req, res) => {
  const accounts = await Account.find().sort({ lastActive: -1 });
  res.json(accounts);
});

app.post('/api/accounts', async (req, res) => {
  let { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  sessionId = sessionId.trim();
  if (!/^[a-zA-Z0-0_-]+$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid sessionId. Use only letters, numbers, underscores, and hyphens.' });
  }

  try {
    const existing = await Account.findOne({ sessionId });
    if (existing) return res.status(400).json({ error: 'Account already exists' });

    // Create a shell account
    await Account.create({
      sessionId,
      status: 'starting',
      provider: 'ollama',
      lastActive: new Date()
    });

    if (createAccountHandler) {
      await createAccountHandler(sessionId);
    }

    res.json({ ok: true, sessionId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.get('/api/status', async (req, res) => {
  const { accountId } = req.query;
  const acc = await Account.findOne({ sessionId: accountId as string });
  const models = aiService ? await aiService.listModels() : [];
  
  res.json({
    sessionId: acc?.sessionId || accountId || null,
    bot: acc?.status || 'disconnected',
    qr: acc?.qrCode || null,
    model: acc?.model || aiService?.getModel() || 'unknown',
    availableModels: models,
    provider: acc?.provider || 'ollama',
    phoneNumber: acc?.phoneNumber || 'Not Linked',
    bio: acc?.bio || '',
    lastActive: acc?.lastActive || null
  });
});

app.get('/api/system-status', async (_req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const accounts = await Account.find();
  res.json({
    mongodb: mongoStatus,
    server: 'online',
    accounts: accounts.map(a => ({ sessionId: a.sessionId, status: a.status, phone: a.phoneNumber }))
  });
});

app.get('/api/analytics', async (req, res) => {
  const { accountId } = req.query;
  const filter = accountId ? { accountId } : {};
  
  const totalMessages = await Chat.countDocuments(filter);
  const modelStats = await Chat.aggregate([
    { $match: filter },
    { $group: { _id: "$model", count: { $sum: 1 } } }
  ]);
  
  const dailyStats = await Chat.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    { $limit: 7 }
  ]);

  res.json({ totalMessages, modelStats, dailyStats });
});

app.get('/api/schema', (_req, res) => {
  res.json({
    Account: {
      sessionId: "String (Unique ID)",
      phoneNumber: "String (Linked Number)",
      status: "String (ready, qr, starting)",
      qrCode: "String (Latest QR payload)",
      provider: "String (ollama, openai)",
      model: "String (Target AI model)",
      lastActive: "Date"
    },
    Chat: {
      accountId: "String (Ref Account)",
      from: "String (Phone No)",
      body: "String (Incoming)",
      reply: "String (AI response)",
      model: "String (AI model used)",
      ts: "Date (Timestamp)"
    },
    Contact: {
      accountId: "String (Ref Account)",
      contactId: "String (Phone No)",
      prompt: "String (Custom instructions)",
      context: "String (User profile context)"
    }
  });
});

app.post('/api/refresh-qr', async (req, res) => {
  const { accountId } = req.body;
  if (!accountId || !refreshQrHandler) return res.status(400).json({ error: 'Session ID and handler required' });
  
  try {
    await refreshQrHandler(accountId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to refresh QR' });
  }
});

app.post('/api/logout', async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ error: 'accountId required' });

  try {
    if (logoutHandler) await logoutHandler(accountId);
    await Account.findOneAndUpdate(
      { sessionId: accountId },
      { status: 'disconnected', phoneNumber: null, qrCode: null, lastActive: new Date() }
    );
    io.emit('account_status', { sessionId: accountId, status: 'disconnected', qr: null });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/summarize/:id', async (req, res) => {
  const { id } = req.params;
  const { accountId } = req.query;
  if (!accountId || !aiService) return res.status(400).json({ error: 'accountId and AI service required' });

  try {
    const history = await Chat.find({ accountId, from: id }).sort({ ts: -1 }).limit(20);
    if (history.length === 0) return res.json({ summary: 'No conversation history yet.' });

    const conversationText = history.reverse().map(m => `User: ${m.body}\nAI: ${m.reply}`).join('\n');
    const summary = await aiService.generateReply(
      accountId as string,
      'system',
      `Summarize the following conversation in 2-3 short bullet points. Focus on the user's personality, needs, and current mood:\n\n${conversationText}`,
      "You are a helpful assistant that summarizes conversations concisely."
    );

    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

app.post('/api/provider', async (req, res) => {
  const { provider, accountId } = req.body as { provider?: ProviderType; accountId?: string };
  if (!provider || !accountId) return res.status(400).json({ error: 'provider and accountId are required' });
  
  await Account.findOneAndUpdate({ sessionId: accountId }, { provider });
  io.emit('provider_changed', { provider, accountId });
  return res.json({ ok: true, provider });
});

app.post('/api/config', async (req, res) => {
  const { apiKey, accountId, bio } = req.body as { apiKey?: string; accountId?: string; bio?: string };
  console.log(`[API] /api/config: accountId=${accountId}, bio=${bio}, apiKey=${apiKey ? '***' : 'none'}`);
  
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });
  
  const update: any = {};
  if (apiKey !== undefined) update.apiKey = apiKey;
  if (bio !== undefined) update.bio = bio;
  
  await Account.findOneAndUpdate({ sessionId: accountId }, update);
  return res.json({ ok: true });
});

app.post('/api/model', async (req, res) => {
  const { model, accountId } = req.body as { model?: string; accountId?: string };
  if (!model || !accountId) return res.status(400).json({ error: 'model and accountId are required' });
  
  await Account.findOneAndUpdate({ sessionId: accountId }, { model });
  io.emit('model_changed', { model, accountId });
  return res.json({ ok: true, model });
});

app.get('/api/contact-prompt/:id', async (req, res) => {
  const { id } = req.params;
  const { accountId } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId required' });
  
  const data = await Contact.findOne({ accountId, contactId: id });
  return res.json(data || { prompt: '', context: '', isAiEnabled: true, chatStyle: 'friendly' });
});

app.post('/api/contact-prompt', async (req, res) => {
  const { id, prompt, context, accountId, name, isAiEnabled, chatStyle } = req.body;
  if (!id || !accountId) return res.status(400).json({ error: 'id and accountId are required' });
  
  await Contact.findOneAndUpdate(
    { accountId, contactId: id },
    { 
      prompt: prompt ?? '', 
      context: context ?? '', 
      name: name ?? '',
      isAiEnabled: isAiEnabled ?? true,
      chatStyle: chatStyle ?? 'friendly'
    },
    { upsert: true }
  );
  
  return res.json({ ok: true });
});

app.post('/api/chat/approve', async (req, res) => {
  const { chatId, text } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    // Mark as approved
    chat.reply = text || chat.draftReply;
    chat.needsApproval = false;
    chat.isApproved = true;
    await chat.save();

    // Trigger WhatsApp send via socket or handler
    io.emit('send_whatsapp_reply', { 
      accountId: chat.accountId, 
      to: chat.from, 
      body: chat.reply,
      chatId: chat._id 
    });

    return res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Approval failed' });
  }
});

// ── Socket.io ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[Socket] Client connected');
});

// ── Exports used by index.ts ───────────────────────────────────────────────

export function registerAiService(service: ProviderManager): void {
  aiService = service;
}

export function registerRefreshHandler(handler: (sessionId: string) => Promise<void>): void {
  refreshQrHandler = handler;
}

export async function updateAccountStatus(sessionId: string, status: string, qr?: string): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    lastActive: new Date(),
    qrCode: status === 'qr' && qr ? qr : null
  };

  await Account.findOneAndUpdate({ sessionId }, update, { upsert: true });
  io.emit('account_status', { sessionId, status, qr: update.qrCode });
}

export async function updateAccountPhone(sessionId: string, phoneNumber: string): Promise<void> {
  await Account.findOneAndUpdate(
    { sessionId },
    { phoneNumber, lastActive: new Date() },
    { upsert: true }
  );
}

export async function broadcastMessage(accountId: string, entry: { from: string; body: string; reply: string; model: string; needsApproval?: boolean; draftReply?: string }): Promise<void> {
  const full = new Chat({ ...entry, accountId, ts: new Date() });
  await full.save();
  
  // ✅ Task 4.3 — Update lastMessageAt on contact for sorting by recency
  const contact = await Contact.findOneAndUpdate(
    { accountId, contactId: entry.from },
    { $set: { lastMessageAt: new Date() } },
    { new: true }
  );
  
  io.emit('new_message', { ...full.toObject(), contact });
}

// ✅ Task 4.4 — Use contact-level prompt first, then account defaultPrompt as fallback
export async function getContactPrompt(accountId: string, contactId: string): Promise<string | undefined> {
  const data = await Contact.findOne({ accountId, contactId });
  
  let combined = '';
  if (data?.context) combined += `User Context: ${data.context}\n`;
  if (data?.prompt) combined += `Custom Instructions: ${data.prompt}`;
  if (combined) return combined;

  // Fallback to account-level default prompt
  const account = await Account.findOne({ sessionId: accountId });
  return account?.defaultPrompt || undefined;
}

export function startServer(port = 3001): void {
  httpServer.listen(port, () => {
    console.log(`[Server] API running on http://localhost:${port}`);
  });
}
