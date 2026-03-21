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
  registerCreateAccountHandler,
  updateAccountStatus,
  updateAccountPhone,
  broadcastMessage,
  getContactPrompt,
  io,
} from './server';
import { Contact as ContactModel } from './models/Contact';
import { Chat as ChatModel } from './models/Chat';

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

  registerCreateAccountHandler(async (sessionId: string) => {
    console.log(`[Bot - ${sessionId}] Starting new session...`);
    await startBot(sessionId);
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

  // Handle approvals from dashboard
  io.on('send_whatsapp_reply', async ({ accountId, to, body }: { accountId: string; to: string; body: string }) => {
    if (accountId === sessionId) {
      try {
        console.log(`[Bot - ${sessionId}] Sending approved/edited reply to ${to}`);
        await waClient.getClient().sendMessage(to, body);
      } catch (err) {
        console.error(`[Bot - ${sessionId}] Failed to send approved reply:`, err);
      }
    }
  });

  // Per-contact message queue to prevent parallel AI requests and act as rate limiter
  const messageQueues: Map<string, Promise<void>> = new Map();

  const processMessage = async (msg: Message) => {
    const from = msg.from;
    const body = msg.body?.trim();
    if (!body) return;

    // ✅ Task 2.3 — Block group chat replies
    if (from.endsWith('@g.us')) return;

    const account = await Account.findOne({ sessionId });
    if (!account) return;

    // Get contact info
    const contact = await msg.getContact();
    const pushname = contact.pushname || '';

    // Update/Create Contact
    const dbContact = await ContactModel.findOneAndUpdate(
      { accountId: sessionId, contactId: from },
      { $set: { pushname } },
      { upsert: true, new: true }
    );

    // ── Command Handler (for User's Own Number) ──
    const myNumber = account.phoneNumber ? `${account.phoneNumber}@c.us` : null;
    if (myNumber && from === myNumber) {
      if (body.toLowerCase().startsWith('approve')) {
        const lastPending = await ChatModel.findOne({ accountId: sessionId, needsApproval: true }).sort({ ts: -1 });
        if (lastPending) {
          try {
            const waMsg = await (waClient as any).getClient().sendMessage(lastPending.from, lastPending.draftReply);
            lastPending.reply = lastPending.draftReply;
            lastPending.needsApproval = false;
            lastPending.isApproved = true;
            await lastPending.save();
            await msg.reply(`✅ Approved and sent to ${lastPending.from}`);
            io.emit('new_message', { ...lastPending.toObject(), contact: await ContactModel.findOne({ accountId: sessionId, contactId: lastPending.from }) });
          } catch (err) {
            await msg.reply('❌ Failed to send approved message.');
          }
        } else {
          await msg.reply('No pending messages to approve.');
        }
        return;
      }

      if (body.toLowerCase().startsWith('edit ')) {
        const newText = body.slice(5).trim();
        const lastPending = await ChatModel.findOne({ accountId: sessionId, needsApproval: true }).sort({ ts: -1 });
        if (lastPending && newText) {
          try {
            await (waClient as any).getClient().sendMessage(lastPending.from, newText);
            lastPending.reply = newText;
            lastPending.needsApproval = false;
            lastPending.isApproved = true;
            await lastPending.save();
            await msg.reply(`✅ Edited and sent to ${lastPending.from}`);
            io.emit('new_message', { ...lastPending.toObject(), contact: await ContactModel.findOne({ accountId: sessionId, contactId: lastPending.from }) });
          } catch (err) {
            await msg.reply('❌ Failed to send edited message.');
          }
        } else {
          await msg.reply('No pending messages to edit.');
        }
        return;
      }
    }

    if (!dbContact.isAiEnabled) return;

    console.log(`[Bot - ${sessionId}] ← ${pushname || from}: ${body}`);

    // Construct enhanced system prompt
    let systemPrompt = `You are representing ${account.sessionId === 'primary' ? 'Harsh' : account.sessionId}. 
Your personality bio: ${account.bio || 'Professional and helpful.'}
Chat style for this contact: ${dbContact.chatStyle || 'friendly'}.
Additional context: ${dbContact.context || ''}
${dbContact.prompt || ''}

CRITICAL RULES:
1. If the user asks for a commitment, availability, personal meeting, or specific action that isn't explicitly covered in your bio, DO NOT reply directly.
2. Instead, prefix your response with [APPROVE] followed by a suggested draft.
3. Example: "[APPROVE] I check with Harsh and get back to you soon."
4. If it's a general question or greeting, reply normally.
`;

    const rawReply = await aiService.generateReply(sessionId, from, body, systemPrompt);
    const needsApproval = rawReply.includes('[APPROVE]');
    const replyText = rawReply.replace('[APPROVE]', '').trim();

    try {
      if (needsApproval) {
        // Save as draft and notify user
        await broadcastMessage(sessionId, { 
          from, body, reply: '', model: aiService.getModel(), 
          needsApproval: true, draftReply: replyText 
        });
        
        if (myNumber) {
          await (waClient as any).getClient().sendMessage(myNumber, `🚨 *Approval Needed*\nFrom: ${pushname || from}\nMsg: ${body}\nDraft: ${replyText}\n\nReply 'Approve' to send, or 'Edit [text]' to modify.`);
        }
        console.log(`[Bot - ${sessionId}] ⌛ Approval requested for ${from}`);
      } else {
        await msg.reply(replyText);
        console.log(`[Bot - ${sessionId}] → ${from}: ${replyText}`);
        await broadcastMessage(sessionId, { from, body, reply: replyText, model: aiService.getModel() });
      }
    } catch (err) {
      console.error(`[Bot - ${sessionId}] Failed to process reply:`, err);
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
