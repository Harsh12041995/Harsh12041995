import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { ProviderManager } from './ai/manager';
import { ProviderType } from './ai/types';
import { Chat } from './models/Chat';
import { Contact } from './models/Contact';
import { Account } from './models/Account';

const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

let aiService: ProviderManager | null = null;

// ── Multi-Account State ─────────────────────────────────────────────────────

// This will help us track which account is currently being "viewed" in the dashboard
// In a real multi-user system, this would be session-based.
let activeDashboardAccount: string | null = null;

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/messages', async (req, res) => {
  const { accountId } = req.query;
  const filter = accountId ? { accountId } : {};
  const messages = await Chat.find(filter).sort({ ts: -1 }).limit(100);
  res.json(messages.reverse());
});

app.get('/api/contacts', async (req, res) => {
  const { accountId } = req.query;
  if (!accountId) return res.json([]);
  const uniqueContacts = await Chat.distinct('from', { accountId });
  return res.json(uniqueContacts);
});

app.get('/api/accounts', async (_req, res) => {
  const accounts = await Account.find();
  res.json(accounts);
});

app.get('/api/status', async (req, res) => {
  const { accountId } = req.query;
  const acc = await Account.findOne({ sessionId: accountId });
  const models = aiService ? await aiService.listModels() : [];
  
  res.json({
    bot: acc?.status || 'disconnected',
    qr: null, // QR is now emitted via socket per account
    model: aiService?.getModel() ?? 'unknown',
    availableModels: models,
    provider: aiService?.getProvider() ?? 'ollama',
  });
});

app.post('/api/provider', (req, res) => {
  const { provider } = req.body as { provider?: ProviderType };
  if (!provider) return res.status(400).json({ error: 'provider is required' });
  aiService?.setProvider(provider);
  io.emit('provider_changed', { provider });
  return res.json({ ok: true, provider });
});

app.post('/api/config', (req, res) => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });
  aiService?.setApiKey(apiKey);
  return res.json({ ok: true });
});

app.get('/api/contact-prompt/:id', async (req, res) => {
  const { id } = req.params;
  const { accountId } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId required' });
  
  const data = await Contact.findOne({ accountId, contactId: id });
  return res.json(data || { prompt: '', context: '' });
});

app.post('/api/contact-prompt', async (req, res) => {
  const { id, prompt, context, accountId } = req.body as { id?: string; prompt?: string; context?: string; accountId?: string };
  if (!id || !accountId) return res.status(400).json({ error: 'id and accountId are required' });
  
  await Contact.findOneAndUpdate(
    { accountId, contactId: id },
    { prompt: prompt || '', context: context || '' },
    { upsert: true }
  );
  
  return res.json({ ok: true });
});

app.post('/api/model', (req, res) => {
  const { model } = req.body as { model?: string };
  if (!model) return res.status(400).json({ error: 'model is required' });
  aiService?.setModel(model);
  io.emit('model_changed', { model });
  return res.json({ ok: true, model });
});

// ── Socket.io ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[Socket] Client connected');
});

// ── Exports used by index.ts ───────────────────────────────────────────────

export function registerAiService(service: ProviderManager): void {
  aiService = service;
}

export async function updateAccountStatus(sessionId: string, status: string, qr?: string): Promise<void> {
  await Account.findOneAndUpdate({ sessionId }, { status, lastActive: new Date() }, { upsert: true });
  io.emit('account_status', { sessionId, status, qr });
}

export async function broadcastMessage(accountId: string, entry: { from: string; body: string; reply: string; model: string }): Promise<void> {
  const full = new Chat({ ...entry, accountId, ts: new Date() });
  await full.save();
  io.emit('new_message', full);
}

export async function getContactPrompt(accountId: string, contactId: string): Promise<string | undefined> {
  const data = await Contact.findOne({ accountId, contactId });
  if (!data) return undefined;
  
  let combined = '';
  if (data.context) combined += `User Context: ${data.context}\n`;
  if (data.prompt) combined += `Custom Instructions: ${data.prompt}`;
  return combined || undefined;
}

export function startServer(port = 3001): void {
  httpServer.listen(port, () => {
    console.log(`[Server] API running on http://localhost:${port}`);
  });
}
