import 'dotenv/config';
import type { Message } from 'whatsapp-web.js';
import { WhatsAppClient } from './whatsapp/client';
import { ProviderManager } from './ai/manager';
import { connectDB } from './db';
import { Account } from './models/Account';
import {
  startServer,
  registerAiService,
  registerRefreshHandler,
  registerLogoutHandler,
  updateAccountStatus,
  updateAccountPhone,
  broadcastMessage,
  getContactPrompt,
} from './server';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const aiService = new ProviderManager();
registerAiService(aiService);

const clients: Map<string, WhatsAppClient> = new Map();

async function init() {
  await connectDB();
  startServer(Number(process.env.PORT) || 3001);

  registerRefreshHandler(async (sessionId: string) => {
    console.log(`[Bot - ${sessionId}] Triggering QR Refresh...`);
    const client = clients.get(sessionId);
    if (client) {
      await client.destroy();
      clients.delete(sessionId);
    }
    await startBot(sessionId);
  });

  registerLogoutHandler(async (sessionId: string) => {
    console.log(`[Bot - ${sessionId}] Logging out...`);
    const client = clients.get(sessionId);
    if (client) {
      await client.logout();
      await client.destroy();
      clients.delete(sessionId);
    }
    // Remove session data so QR is shown fresh on next start
    const fs = await import('fs');
    const sessionPath = process.env.SESSION_PATH || './.wwebjs_auth';
    const sessionDir = `${sessionPath}/session-${sessionId}`;
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`[Bot - ${sessionId}] Session data cleared.`);
    }
  });

  const savedAccounts = await Account.find();
  if (savedAccounts.length === 0) {
    await startBot('primary');
  } else {
    for (const acc of savedAccounts) {
      await startBot(acc.sessionId);
    }
  }
}

async function startBot(sessionId: string) {
  if (clients.has(sessionId)) return;

  const waClient = new WhatsAppClient(sessionId);
  clients.set(sessionId, waClient);

  // Per-contact message queue to prevent parallel AI requests and act as rate limiter
  const messageQueues: Map<string, Promise<void>> = new Map();

  const processMessage = async (msg: Message) => {
    const from = msg.from;
    const body = msg.body?.trim();
    if (!body) return;

    // ✅ Task 2.3 — Block group chat replies (IDs ending in @g.us are groups)
    if (from.endsWith('@g.us')) return;

    // Get contact info from WhatsApp
    const contact = await msg.getContact();
    const pushname = contact.pushname || '';

    // Update or create Contact record with pushname
    const { Contact } = await import('./models/Contact');
    await Contact.findOneAndUpdate(
      { accountId: sessionId, contactId: from },
      { $set: { pushname } },
      { upsert: true }
    );

    console.log(`[Bot - ${sessionId}] ← ${pushname || from}: ${body}`);

    const customPrompt = await getContactPrompt(sessionId, from);
    const reply = await aiService.generateReply(sessionId, from, body, customPrompt);

    try {
      await msg.reply(reply);
      console.log(`[Bot - ${sessionId}] → ${from}: ${reply}`);
      await broadcastMessage(sessionId, { from, body, reply, model: aiService.getModel() });
    } catch (err) {
      console.error(`[Bot - ${sessionId}] Failed to reply:`, err);
    }
  };

  // ✅ Task 3.3 — Rate-limiting message queue: processes one message per contact at a time,
  // preventing parallel AI requests that could overload Ollama or hit OpenAI rate limits.
  const handleMessage = async (msg: Message) => {
    const key = `${sessionId}:${msg.from}`;
    const prev = messageQueues.get(key) || Promise.resolve();
    const next = prev.then(() => processMessage(msg)).catch(() => {}); // Never block queue on error
    messageQueues.set(key, next);
    await next;
  };

  const handleStatus = (status: string, data?: string) => {
    updateAccountStatus(sessionId, status === 'authenticated' ? 'ready' : status, data);
    
    // If authenticated, we try to get the number
    if (status === 'ready' || status === 'authenticated') {
      const info = waClient.getClient().info;
      if (info?.wid?.user) {
        updateAccountPhone(sessionId, info.wid.user);
      }
    }
  };

  waClient.initialize(handleMessage, handleStatus as any).catch((err) => {
    console.error(`[Bot - ${sessionId}] Fatal error:`, err);
  });
}

init().catch(err => {
  console.error('[Bot] Initialization failed:', err);
});
