import 'dotenv/config';
import type { Message } from 'whatsapp-web.js';
import { WhatsAppClient } from './whatsapp/client';
import { ProviderManager } from './ai/manager';
import { connectDB } from './db';
import { Account } from './models/Account';
import {
  startServer,
  registerAiService,
  updateAccountStatus,
  broadcastMessage,
  getContactPrompt,
} from './server';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const aiService = new ProviderManager();
registerAiService(aiService);

// Store active clients
const clients: Map<string, WhatsAppClient> = new Map();

async function init() {
  await connectDB();
  startServer(Number(process.env.PORT) || 3001);

  // Load existing accounts from DB and start them
  const savedAccounts = await Account.find();
  if (savedAccounts.length === 0) {
    // If no accounts exist, create a default "primary" session
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

  // Message handler scoped to this sessionId
  const handleMessage = async (msg: Message) => {
    const from = msg.from;
    const body = msg.body?.trim();
    if (!body) return;

    console.log(`[Bot - ${sessionId}] ← ${from}: ${body}`);
    const customPrompt = await getContactPrompt(sessionId, from);
    const reply = await aiService.generateReply(from, body, customPrompt);

    await msg.reply(reply);
    console.log(`[Bot - ${sessionId}] → ${from}: ${reply}`);
    
    await broadcastMessage(sessionId, { from, body, reply, model: aiService.getModel() });
  };

  // Status handler scoped to this sessionId
  const handleStatus = (status: string, data?: string) => {
    updateAccountStatus(sessionId, status === 'authenticated' ? 'ready' : status, data);
  };

  waClient.initialize(handleMessage, handleStatus as any).catch((err) => {
    console.error(`[Bot - ${sessionId}] Fatal error:`, err);
  });
}

init().catch(err => {
  console.error('[Bot] Initialization failed:', err);
});
