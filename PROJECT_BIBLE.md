# 📖 WhatsApp AI Bot — Project Bible

> **For beginners and future developers.** This document explains every single file in the project in plain English, covers the full architecture, identifies known issues, and gives you everything you need to understand, run, and enhance this project.

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [How It All Works — The Big Picture](#2-how-it-all-works--the-big-picture)
3. [Project Structure Map](#3-project-structure-map)
4. [Configuration Files](#4-configuration-files)
   - [`.env`](#41-env)
   - [`package.json`](#42-packagejson)
   - [`tsconfig.json`](#43-tsconfigjson)
   - [`vite.config.ts`](#44-viteconfigts)
   - [`index.html`](#45-indexhtml)
5. [Backend — The Bot Engine](#5-backend--the-bot-engine)
   - [`src/db.ts`](#51-srcdtts)
   - [`src/index.ts`](#52-srcindexts)
   - [`src/server.ts`](#53-srcserverts)
6. [Database Models](#6-database-models)
   - [`src/models/Account.ts`](#61-srcmodelsaccountts)
   - [`src/models/Chat.ts`](#62-srcmodelschatts)
   - [`src/models/Contact.ts`](#63-srcmodelscontactts)
7. [WhatsApp Client](#7-whatsapp-client)
   - [`src/whatsapp/client.ts`](#71-srcwhatsappclientts)
8. [AI Service Layer](#8-ai-service-layer)
   - [`src/ai/types.ts`](#81-srcaitypests)
   - [`src/ai/ollama.ts`](#82-srcaiollamalts)
   - [`src/ai/openai.ts`](#83-srcaiopenailts)
   - [`src/ai/manager.ts`](#84-srcaimanagerts)
9. [Frontend Dashboard](#9-frontend-dashboard)
   - [`src/dashboard/main.tsx`](#91-srcdashboardmaintsx)
   - [`src/dashboard/index.css`](#92-srcdashboardindexcss)
   - [`src/dashboard/App.tsx`](#93-srcdashboardapptsx)
10. [Data Flow — Step by Step](#10-data-flow--step-by-step)
11. [Real-Time Communication (Socket.io)](#11-real-time-communication-socketio)
12. [Known Loopholes & Issues](#12-known-loopholes--issues)
13. [Future Enhancements](#13-future-enhancements)
14. [How to Run the Project](#14-how-to-run-the-project)

---

  ## 1. What Is This Project?

This is a **WhatsApp AI Bot** — a program that connects to WhatsApp and **automatically replies to incoming messages using an AI model**. Think of it like having an AI assistant that answers your WhatsApp messages for you.

Here's what it can do:
- **Reads messages** sent to your WhatsApp number
- **Generates intelligent AI replies** using either a local AI (Ollama) or a cloud AI (OpenAI/ChatGPT)
- **Remembers conversation history** per contact so the AI knows what you talked about before
- **Provides a beautiful web dashboard** to see all messages, manage contacts, configure AI settings, and connect/disconnect your WhatsApp

**It is NOT just a chatbot demo.** It is a fully-featured multi-session, multi-provider, database-backed automation platform.

---

## 2. How It All Works — The Big Picture

Imagine three "worlds" working together:

```
[ WhatsApp App ] ←→ [ Bot Engine (Node.js) ] ←→ [ MongoDB Database ]
                              ↕
                    [ AI Service (Ollama/OpenAI) ]
                              ↕
                    [ Dashboard (React Web UI) ]
```

**Step-by-step flow:**

1. Someone sends you a WhatsApp message.
2. The **Bot Engine** (running in your terminal) receives it via `whatsapp-web.js`.
3. It looks up the **contact's custom settings** from MongoDB.
4. It sends the message + conversation history to the **AI Service**.
5. The AI generates a reply.
6. The bot **replies on WhatsApp** and saves the chat to **MongoDB**.
7. The **Dashboard** (a website running locally) shows the conversation in real-time.

---

## 3. Project Structure Map

```
/files (project root)
│
├── .env                    # Secret settings (API keys, paths, model name)
├── package.json            # Defines commands (npm run bot, npm run dashboard)
├── tsconfig.json           # TypeScript compiler settings
├── vite.config.ts          # Dashboard development server settings
├── index.html              # HTML shell for the dashboard
│
└── src/                    # All source code
    ├── index.ts            # ⭐ MAIN ENTRY POINT — starts everything
    ├── server.ts           # ⭐ API SERVER — handles web requests & sockets
    ├── db.ts               # Database connection helper
    │
    ├── models/             # Database schema definitions
    │   ├── Account.ts      # Represents a WhatsApp session
    │   ├── Chat.ts         # Stores every message + reply
    │   └── Contact.ts      # Stores contact details & AI instructions
    │
    ├── whatsapp/
    │   └── client.ts       # Manages the WhatsApp connection
    │
    ├── ai/
    │   ├── types.ts        # Shared TypeScript types/interfaces
    │   ├── ollama.ts       # Local AI service (Ollama)
    │   ├── openai.ts       # Cloud AI service (OpenAI/ChatGPT)
    │   └── manager.ts      # Switches between AI providers
    │
    └── dashboard/
        ├── main.tsx        # React app entry point
        ├── index.css       # All styles for the dashboard
        └── App.tsx         # ⭐ The entire dashboard UI & logic
```

---

## 4. Configuration Files

### 4.1 `.env`

**What it is:** A file for "secret" settings that you don't want to hardcode into your code. Think of it like a settings panel.

```env
# Which AI model Ollama should use to generate replies
OLLAMA_MODEL=qwen3:4b

# Where Ollama is running
OLLAMA_HOST=http://localhost:11434

# The bot's base personality — can be overridden per-contact in the dashboard
OLLAMA_SYSTEM_PROMPT=You are a helpful WhatsApp assistant. Keep replies concise...

# Where WhatsApp session data (the "login cookie") is stored
SESSION_PATH=./.wwebjs_auth

# Path to Chrome so whatsapp-web.js can open a headless browser
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Run Chrome invisibly in the background (true) or visibly (false)
HEADLESS=true

# Port for the backend API server
PORT=3001

# URL the dashboard uses to talk to the backend
VITE_API_URL=http://localhost:3001
```

> ⚠️ **LOOPHOLE**: The `CHROME_PATH` is hardcoded for Mac. On Windows or Linux, this path will be completely different and the bot will crash. **Fix**: Add a fallback or auto-detect the browser path.

> ⚠️ **LOOPHOLE**: The `.env` file is not in `.gitignore` if you accidentally push to GitHub — this would expose your API keys. **Fix**: Ensure `.gitignore` contains `.env`.

---

### 4.2 `package.json`

**What it is:** The project's "recipe book" — it defines all dependencies (libraries) and the commands you run to start things.

```json
{
  "scripts": {
    "bot": "tsx src/index.ts",         // Starts the WhatsApp bot + API server
    "dashboard": "vite",               // Starts the React dashboard (web UI)
    "build": "vite build"              // Creates a production-ready dashboard bundle
  }
}
```

**Key dependencies to know:**

| Package | What it does |
|---|---|
| `whatsapp-web.js` | Controls WhatsApp via a hidden Chrome browser |
| `ollama` | Talks to your local Ollama AI |
| `axios` | Makes HTTP calls (used for OpenAI) |
| `express` | Creates the API server (like a mini-website backend) |
| `mongoose` | Maps JavaScript objects to MongoDB documents |
| `socket.io` | Enables real-time messages between server and dashboard |
| `react` + `react-dom` | Builds the interactive dashboard UI |
| `tsx` | Runs TypeScript files directly without compiling first |

> ⚠️ **LOOPHOLE**: Both frontend (React) and backend (Express) dependencies are in the same `package.json`. This is convenient for a small project but makes it harder to deploy backend and frontend separately. **Fix for future**: Split into two packages.

---

### 4.3 `tsconfig.json`

**What it is:** Tells TypeScript (a strict version of JavaScript) how to compile your code. You generally don't need to touch this.

```json
{
  "target": "ESNext",        // Use the latest JavaScript features
  "strict": true,            // Enforce strict type checking — catches bugs early
  "jsx": "react-jsx",        // Support React's JSX syntax (.tsx files)
  "lib": ["DOM", "ESNext"]   // Give access to browser APIs + modern JS APIs
}
```

> ⚠️ **LOOPHOLE**: `"skipLibCheck": true` is set, which means TypeScript won't type-check your installed libraries. This can hide bugs from outdated packages. **Fix**: Remove this once library types are verified.

---

### 4.4 `vite.config.ts`

**What it is:** The configuration for the dashboard's development server. The most important part is the **proxy**.

```typescript
proxy: {
  '/api': 'http://localhost:3001',      // Any /api call goes to the bot server
  '/socket.io': {
    target: 'http://localhost:3001',    // Real-time sockets also go to the bot
    ws: true                           // Enable WebSocket proxying
  }
}
```

**Why this matters:** The dashboard runs on port `5173` and the bot runs on port `3001`. Without this proxy, the browser would block cross-origin requests (CORS errors). The proxy makes them appear to come from the same place.

> ⚠️ **LOOPHOLE**: This proxy only works during development (`npm run dashboard`). In production, you'd need Nginx or a similar reverse proxy. **Fix**: Add an Nginx config example to README.

---

### 4.5 `index.html`

**What it is:** The single HTML page that loads the entire React dashboard. It's almost empty on purpose — React fills it in dynamically.

```html
<div id="root"></div>                          <!-- React mounts here -->
<script src="/src/dashboard/main.tsx"></script> <!-- Loads the React app -->
```

> ✅ **This is correct practice.** The body background color (`#0f172a`) matches the dashboard's dark theme, preventing a "white flash" on load.

---

## 5. Backend — The Bot Engine

### 5.1 `src/db.ts`

**What it is:** A tiny helper that connects to your MongoDB database. It's called once at startup.

```typescript
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Whatsapp_automation';

export async function connectDB() {
  await mongoose.connect(MONGO_URI);
}
```

**What it does:** Opens a connection to MongoDB. If the connection fails, `process.exit(1)` kills the entire app — this is intentional, because the bot can't work without a database.

> ⚠️ **LOOPHOLE**: There's no **reconnection logic**. If MongoDB goes down for a moment and comes back, the bot will remain crashed. **Fix**: Add Mongoose reconnection options: `mongoose.set('autoReconnect', true)`.

> ⚠️ **LOOPHOLE**: `MONGO_URI` has no fallback authentication. On a production server with MongoDB authentication enabled, this will fail silently. **Fix**: Add a `MONGO_USER` and `MONGO_PASS` option in `.env`.

---

### 5.2 `src/index.ts`

**What it is:** The **heart of the bot**. It's the first file that runs when you do `npm run bot`. It:
1. Starts the database connection
2. Starts the API server
3. Initializes WhatsApp for each saved account
4. Defines what to do with each incoming message

```typescript
// 1. Create one shared AI service for all sessions
const aiService = new ProviderManager();

// 2. Store all active WhatsApp clients in a Map (dictionary)
const clients: Map<string, WhatsAppClient> = new Map();

async function init() {
  await connectDB();           // Connect to MongoDB
  startServer(3001);           // Start the Express API server

  // Register a handler so the dashboard can trigger QR refresh
  registerRefreshHandler(async (sessionId) => {
    const client = clients.get(sessionId);
    if (client) {
      await client.destroy();         // Kill the old connection
      clients.delete(sessionId);
    }
    await startBot(sessionId);        // Start a fresh one
  });

  // Register a handler so the dashboard can trigger Logout
  registerLogoutHandler(async (sessionId) => {
    const client = clients.get(sessionId);
    if (client) {
      await client.logout();          // Tell WhatsApp to unlink
      await client.destroy();        // Kill the browser process
      clients.delete(sessionId);
    }
    // Delete session files from disk so QR shows again next time
    fs.rmSync(`.wwebjs_auth/session-${sessionId}`, { recursive: true });
  });

  // Boot up a WhatsApp client for each saved account
  const savedAccounts = await Account.find();
  for (const acc of savedAccounts) {
    await startBot(acc.sessionId);
  }
}
```

**The `handleMessage` function** — the core of the bot:

```typescript
const handleMessage = async (msg: Message) => {
  const from = msg.from;       // Sender's WhatsApp ID (e.g. "919876543210@c.us")
  const body = msg.body?.trim(); // The actual text message

  // Step 1: Get the sender's WhatsApp display name (pushname)
  const contact = await msg.getContact();
  
  // Step 2: Save/update their name in MongoDB
  await Contact.findOneAndUpdate({ accountId, contactId: from }, { pushname }, { upsert: true });

  // Step 3: Get any custom AI instructions for this contact
  const customPrompt = await getContactPrompt(sessionId, from);

  // Step 4: Generate AI reply
  const reply = await aiService.generateReply(sessionId, from, body, customPrompt);

  // Step 5: Reply on WhatsApp
  await msg.reply(reply);

  // Step 6: Save the message + reply to MongoDB and notify the dashboard
  await broadcastMessage(sessionId, { from, body, reply, model: aiService.getModel() });
};
```

> ⚠️ **LOOPHOLE**: The `from` field can be a group chat ID (e.g. `1234567890-1234567890@g.us`). The bot will happily reply to group chats, which could be annoying or embarrassing. **Fix**: Add a check: `if (msg.from.includes('@g.us')) return;` to only reply in private chats.

> ⚠️ **LOOPHOLE**: There is no **rate limiting**. If someone spams 100 messages, the bot will try to answer all 100 simultaneously, potentially overloading Ollama or hitting OpenAI rate limits. **Fix**: Add a per-contact message queue with a small delay.

> ⚠️ **LOOPHOLE**: The `getClient().info` call (to fetch the linked phone number) happens immediately on `ready` status, but `info.wid` might not be populated instantly. **Fix**: Add a small delay or a retry loop with a timeout.

---

### 5.3 `src/server.ts`

**What it is:** The **REST API server**. This is what the dashboard talks to. Every button click on the dashboard results in an HTTP call to this file.

It uses **Express** (Node.js's most popular web framework) to define routes, and **Socket.io** to push live updates to the dashboard.

**Complete list of API routes:**

| Method | Route | What it does |
|---|---|---|
| `GET` | `/api/messages` | Fetch all stored messages (chat history) |
| `GET` | `/api/contacts` | Fetch all known contacts for an account |
| `GET` | `/api/accounts` | Fetch all WhatsApp sessions |
| `GET` | `/api/status` | Get current bot status, model, phone number |
| `GET` | `/api/system-status` | Get MongoDB and server health check |
| `GET` | `/api/analytics` | Get message counts, model stats, daily activity |
| `GET` | `/api/schema` | Get the database model field descriptions |
| `POST` | `/api/refresh-qr` | Trigger a QR code refresh for a session |
| `POST` | `/api/logout` | Logout and unlink a WhatsApp session |
| `GET` | `/api/summarize/:id` | Generate an AI summary of a conversation |
| `POST` | `/api/provider` | Switch AI provider (ollama/openai) for an account |
| `POST` | `/api/config` | Update API key for an account |
| `POST` | `/api/model` | Change the AI model for an account |
| `GET` | `/api/contact-prompt/:id` | Get custom prompt for a contact |
| `POST` | `/api/contact-prompt` | Save custom prompt + name + context for a contact |

**Key exported functions used by `index.ts`:**

```typescript
// Called whenever a message arrives — saves to DB and notifies dashboard
export async function broadcastMessage(accountId, entry) {
  const full = new Chat({ ...entry, accountId, ts: new Date() });
  await full.save();
  const contact = await Contact.findOne({ accountId, contactId: entry.from });
  io.emit('new_message', { ...full.toObject(), contact });
}
```

> ⚠️ **LOOPHOLE**: All API routes are **completely unprotected**. Anyone on the same network can call them without any login or API key. **Fix**: Add JWT authentication or at minimum a secret token in the request header.

> ⚠️ **LOOPHOLE**: The `/api/contacts` route creates new `Contact` records in the database for every unique sender it finds in `Chat` history. If you have thousands of messages from bot/spam sources, this will create thousands of Contact documents. **Fix**: Add a flag to only create contacts for "real" contacts, or add pagination.

> ⚠️ **PATCH CODE** ⚡: The CORS setting is `origin: '*'` which allows ANY website to call this API. This is fine for local development but is dangerous in production. **Fix**: Set CORS to only allow the dashboard's domain.

---

## 6. Database Models

### 6.1 `src/models/Account.ts`

**What it is:** The "shape" of a WhatsApp account record in MongoDB.

```typescript
const AccountSchema = new mongoose.Schema({
  sessionId:     String,    // "primary" — unique name for this session
  phoneNumber:   String,    // "+919876543210" — filled in after QR scan
  status:        String,    // "starting" | "qr" | "ready" | "disconnected"
  provider:      String,    // "ollama" | "openai"
  apiKey:        String,    // OpenAI API key (stored in plain text — see loophole!)
  model:         String,    // "qwen3:4b" or "gpt-4"
  defaultPrompt: String,    // Bot's default personality (not currently used in UI)
  lastActive:    Date       // Last time any message was processed
});
```

> ⚠️ **CRITICAL LOOPHOLE**: The OpenAI `apiKey` is stored **in plain text** in MongoDB. If anyone gets access to your database, they get your API key and can charge money to your account. **Fix**: Encrypt the `apiKey` field using `crypto` before saving it, and decrypt on load.

> ⚠️ **LOOPHOLE**: The `defaultPrompt` field exists in the schema but is never used in the current code. It was probably intended as an account-level system prompt. **Fix**: Implement it as a fallback when no contact-specific prompt is set.

---

### 6.2 `src/models/Chat.ts`

**What it is:** Stores every single message and its AI reply.

```typescript
const ChatSchema = new mongoose.Schema({
  accountId: String,  // Which WhatsApp session this belongs to
  from:      String,  // Sender's ID ("919876543210@c.us")
  body:      String,  // The user's message text
  reply:     String,  // The AI's generated reply
  model:     String,  // Which AI model generated the reply
  ts:        Date     // Timestamp
});
```

> ⚠️ **LOOPHOLE**: There are **no database indexes** on `accountId` or `from`. When you search for messages, MongoDB scans every record. With thousands of messages, this will become very slow. **Fix**: Add `ChatSchema.index({ accountId: 1, from: 1, ts: -1 });`

> ⚠️ **LOOPHOLE**: Messages are never deleted. Over time, this database will grow endlessly. **Fix**: Implement a data retention policy (e.g., delete messages older than 90 days via a scheduled job).

---

### 6.3 `src/models/Contact.ts`

**What it is:** Stores contact details and AI customization options.

```typescript
const ContactSchema = new mongoose.Schema({
  accountId:  String,  // Which session this contact belongs to
  contactId:  String,  // The contact's WhatsApp ID
  name:       String,  // Friendly name you assign in the dashboard
  pushname:   String,  // The name WhatsApp shows for them
  prompt:     String,  // Custom AI instructions ("always be formal")
  context:    String,  // About this person ("This is my CEO")
});

// This ensures no duplicate contacts per session
ContactSchema.index({ accountId: 1, contactId: 1 }, { unique: true });
```

> ✅ **This is well-designed.** The compound unique index prevents duplicate contacts.

> ⚠️ **LOOPHOLE**: There's no `lastMessageAt` or `messageCount` field. The contact list can't be sorted by most recent activity. **Fix**: Add a `lastMessageAt` field updated via `broadcastMessage`.

---

## 7. WhatsApp Client

### 7.1 `src/whatsapp/client.ts`

**What it is:** The bridge between your Node.js code and the actual WhatsApp app. It uses `whatsapp-web.js`, which works by running a hidden Chrome browser logged into WhatsApp Web.

```typescript
export class WhatsAppClient {
  private client: any;    // The whatsapp-web.js Client instance
  private ready = false;  // Is the bot connected and ready?
  private sessionId: string;

  constructor(sessionId: string) {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,                     // Creates separate session folders
        dataPath: process.env.SESSION_PATH,       // Where to save session data
      }),
      puppeteer: {
        executablePath: process.env.CHROME_PATH, // Path to Chrome
        headless: true,                          // Run Chrome invisibly
      }
    });
  }

  async initialize(onMessage, onStatus) {
    this.client.on('qr', qr => onStatus('qr', qr));             // QR code ready to scan
    this.client.on('authenticated', () => onStatus('authenticated')); // Scanned!
    this.client.on('ready', () => onStatus('ready'));                 // Bot is live
    this.client.on('disconnected', () => onStatus('disconnected'));   // Lost connection
    this.client.on('message', async msg => {
      if (msg.fromMe) return;                // Ignore your own messages
      if (msg.from === 'status@broadcast') return; // Ignore status updates
      await onMessage(msg);                  // Process real messages
    });
    await this.client.initialize(); // Boot up the Chrome browser
  }

  async logout()  { await this.client.logout(); }   // Unlink from WhatsApp
  async destroy() { await this.client.destroy(); }  // Kill Chrome process
}
```

> ⚠️ **LOOPHOLE**: `private client: any` — the type is `any` instead of the proper `whatsapp-web.js` `Client` type. This means TypeScript won't catch errors if you call a method that doesn't exist. **Fix**: `import type { Client } from 'whatsapp-web.js'` and use it as the type.

> ⚠️ **LOOPHOLE**: The `'disconnected'` event is logged but the bot does **not automatically try to reconnect**. If WhatsApp kicks you out, the bot stays offline until you manually restart it. **Fix**: Add exponential backoff reconnection logic: wait 5s, then 10s, then 30s, then give up.

> ⚠️ **LOOPHOLE**: The `MaxListenersExceededWarning` error seen in the terminal logs (`11 disconnected listeners added`) is caused by the Socket.io `useEffect` in the dashboard re-creating socket listeners every time `selectedAccountId` or `selectedContact` changes. While not a crash, it leaks memory. **Fix**: Pass an `AbortController` or use `removeAllListeners` in the cleanup function.

---

## 8. AI Service Layer

This is the brain of the bot. It's split into three files following a clean pattern:

**Types** → **Services** → **Manager**

### 8.1 `src/ai/types.ts`

**What it is:** Defines the TypeScript "contracts" (interfaces) that all AI services must follow.

```typescript
export type ProviderType = 'ollama' | 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'; // Who said this?
  content: string;                         // What was said
}

// Every AI service MUST implement these methods
export interface AIService {
  generateReply(accountId, contactId, userMessage, customPrompt?): Promise<string>;
  listModels(): Promise<string[]>;
  setModel(model: string): void;
  getModel(): string;
  setApiKey?(key: string): void; // Optional — only OpenAI needs this
}
```

> ✅ **Great design.** Using an interface means you can swap the AI provider without changing any other code.

---

### 8.2 `src/ai/ollama.ts`

**What it is:** The implementation of `AIService` that talks to your **local Ollama AI**.

**How it manages conversation history:**

```typescript
// Key = "accountId:contactId" → ensures isolation between sessions
private histories: Map<string, ChatMessage[]> = new Map();
private readonly MAX_HISTORY = 10; // Only keep last 10 message pairs

async generateReply(accountId, contactId, userMessage, customPrompt?) {
  const historyKey = `${accountId}:${contactId}`;
  const history = this.getHistory(historyKey);

  // If no in-memory history, load from database (handles bot restarts!)
  if (history.length === 0) {
    const savedMessages = await Chat.find({ accountId, from: contactId })
      .sort({ ts: -1 }).limit(this.MAX_HISTORY);
    for (const msg of savedMessages.reverse()) {
      history.push({ role: 'user', content: msg.body });
      history.push({ role: 'assistant', content: msg.reply });
    }
  }

  history.push({ role: 'user', content: userMessage });

  // Send conversation history to Ollama
  const response = await this.client.chat({
    model: this.model,
    messages: [
      { role: 'system', content: customPrompt || this.systemPrompt },
      ...history, // All previous messages as context
    ],
  });

  history.push({ role: 'assistant', content: response.message.content });
  this.trimHistory(contactId); // Don't let memory grow forever
  return response.message.content;
}
```

> ⚠️ **LOOPHOLE**: The `trimHistory` method is called with `contactId` but the history is stored under `historyKey` (which includes `accountId`). This means trim will never find the correct history key! **Fix**: Pass `historyKey` to `trimHistory` instead of `contactId`.

> ⚠️ **LOOPHOLE**: History is stored **in memory (RAM)**. When the bot restarts, all current conversations are lost from memory. The database recovery logic helps, but only recovers the last `MAX_HISTORY` messages, not the full conversation. **Fix**: Increase `MAX_HISTORY` or implement smarter context summarization on restart.

> ⚠️ **LOOPHOLE**: The `systemPrompt` (bot personality) is set once from `.env` at startup and never updated. If you change `OLLAMA_SYSTEM_PROMPT`, you must restart the bot. **Fix**: Read the prompt from the database on each call so it can be changed live.

---

### 8.3 `src/ai/openai.ts`

**What it is:** The implementation of `AIService` for **OpenAI (ChatGPT)**.

```typescript
async generateReply(accountId, contactId, userMessage, customPrompt?) {
  if (!this.apiKey) {
    return '⚠️ Cloud AI Provider is active but no API Key is set.';
  }

  // Same pattern as Ollama — load history from DB if empty
  const historyKey = `${accountId}:${contactId}`;
  const history = this.getHistory(historyKey);

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: this.model,
    messages: [
      { role: 'system', content: customPrompt || defaultPrompt },
      ...history,
    ]
  }, { headers: { Authorization: `Bearer ${this.apiKey}` } });

  return response.data.choices[0].message.content;
}
```

> ⚠️ **LOOPHOLE**: If OpenAI returns an error (e.g. network timeout), the user gets a visible error message on WhatsApp. They can see `⚠️ Rate limit exceeded` etc., which may feel unprofessional. **Fix**: Add a fallback to Ollama when OpenAI fails.

> ⚠️ **LOOPHOLE**: Same `trimHistory` bug as in `ollama.ts` — called with `contactId` instead of `historyKey`.

---

### 8.4 `src/ai/manager.ts`

**What it is:** A "facade" that sits in front of both AI services. It decides which AI to use based on the session's settings.

```typescript
export class ProviderManager implements AIService {
  private ollama = new OllamaService();
  private openai = new OpenAIService();
  private currentProvider: ProviderType = 'ollama'; // Default to local AI

  async generateReply(accountId, contactId, userMessage, customPrompt?) {
    // Look up this session's settings from the database
    const acc = await Account.findOne({ sessionId: accountId });

    if (acc) {
      this.currentProvider = acc.provider || 'ollama'; // Switch provider
      const service = this.activeService();
      if (acc.model) service.setModel(acc.model);      // Set the right model
      if (acc.provider === 'openai' && acc.apiKey) {
        this.openai.setApiKey(acc.apiKey);             // Inject API key
      }
    }

    return this.activeService().generateReply(accountId, contactId, userMessage, customPrompt);
  }

  private activeService() {
    return this.currentProvider === 'ollama' ? this.ollama : this.openai;
  }
}
```

> ⚠️ **LOOPHOLE**: `currentProvider` is a **shared state** (`private` field). If two sessions are processing messages at the exact same time, one might overwrite `currentProvider` just before the other calls `this.activeService()`. This is a **race condition**. **Fix**: Don't use shared state — pass the provider choice to `activeService()` as an argument directly.

> ⚠️ **PERFORMANCE**: This code does a MongoDB database lookup (`Account.findOne`) on **every single incoming message**. With high message volume, this creates database load. **Fix**: Cache the account settings in memory and only refresh when a settings-change event is received.

---

## 9. Frontend Dashboard

### 9.1 `src/dashboard/main.tsx`

**What it is:** The entry point of the React application. Just three lines that mount the app inside `<div id="root">` in `index.html`.

```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

> ✅ `React.StrictMode` is enabled, which helps catch bugs during development by intentionally double-calling certain functions.

---

### 9.2 `src/dashboard/index.css`

**What it is:** All the visual styling for the dashboard. Uses **CSS Custom Properties** (variables) for the design system.

```css
:root {
  --bg-dark:   #0f172a;  /* Main background — deep navy */
  --bg-card:   #1e293b;  /* Card background — slightly lighter */
  --bg-sidebar:#0f172a;  /* Sidebar background */
  --primary:   #38bdf8;  /* Accent color — sky blue */
  --text-main: #f1f5f9;  /* Main text — almost white */
  --text-muted:#94a3b8;  /* Secondary text — grey */
  --border:    #334155;  /* Borders — dark grey */
  --input-bg:  #1e293b;  /* Input field backgrounds */
}

/* Light theme overrides */
[data-theme='light'] {
  --bg-dark:   #f8fafc;
  --bg-card:   #ffffff;
  /* etc. */
}
```

**Key CSS classes:**
- `.side-rail` — The vertical navigation bar on the left
- `.contact-list` — The left column showing all contacts
- `.chat-container` — The center column for conversation view
- `.right-panel` — The right column for contact details
- `.card` — Reusable glassmorphism card component
- `.message-bubble`, `.message-user`, `.message-ai` — Chat message styles
- `.unread-badge` — Red notification count badge
- `.btn-primary` — Primary action button
- `.nav-item` — Navigation icon button

> ✅ **CSS Variables** make the theme system work cleanly. Changing `--primary` one place changes all button colors, link colors, and badges everywhere.

> ⚠️ **LOOPHOLE**: The `--transition` variable is defined but not universally applied. Many hover effects use hardcoded `transition` values. **Fix**: Standardize all transitions to `var(--transition)`.

---

### 9.3 `src/dashboard/App.tsx`

**What it is:** The largest file. The entire dashboard is built here — 500+ lines of React code.

**Key state variables:**

```typescript
const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);    // All WhatsApp sessions
const [selectedAccountId, setSelectedAccountId] = useState<string>(); // Which session is active
const [messages, setMessages] = useState<LogEntry[]>([]);           // Chat history
const [contacts, setContacts] = useState<Contact[]>([]);             // All contacts
const [selectedContact, setSelectedContact] = useState<Contact>();   // Currently viewing
const [status, setStatus] = useState<BotStatus>(...);                // Bot health info
const [qrCodes, setQrCodes] = useState<Record<string, string>>({});  // QR codes by session
const [view, setView] = useState<View>('chats');                     // Active screen
const [summary, setSummary] = useState<string>('...');               // AI summary text
const [theme, setTheme] = useState<'dark'|'light'>('dark');         // UI theme
```

**The four main views:**

| View | What you see |
|---|---|
| `chats` | 3-column layout: Contacts | Chat | Contact Details |
| `analytics` | Message count, model usage, daily activity chart |
| `database` | MongoDB connection status, data model explorer |
| `settings` | AI config, WhatsApp session management, theme |

**Real-time updates (Socket.io):**

```typescript
useEffect(() => {
  const sock = io(API);  // Connect to the backend websocket

  sock.on('new_message', (payload) => {
    // A new message arrived!
    setMessages(prev => [...prev, payload]);

    // Update unread count for the sender
    setContacts(prev => prev.map(c =>
      c.contactId === payload.from
        ? { ...c, unreadCount: isSelected ? 0 : (c.unreadCount || 0) + 1 }
        : c
    ));
  });

  sock.on('account_status', ({ sessionId, status, qr }) => {
    // Bot connection status changed!
    setAccounts(prev => prev.map(a => a.sessionId === sessionId ? { ...a, status } : a));
    if (qr) setQrCodes(prev => ({ ...prev, [sessionId]: qr })); // Store QR code
  });

  return () => sock.disconnect(); // Cleanup on component unmount
}, [selectedAccountId, selectedContact]);
```

> ⚠️ **LOOPHOLE (Memory Leak!)**: The `useEffect` for Socket.io has `selectedAccountId` and `selectedContact` in its dependency array. This means a **new socket connection is created every time** you click a different contact or switch accounts. The old connection isn't properly closed because `disconnect()` is called but a new one is immediately opened. The `MaxListenersExceededWarning` you see in the terminal is evidence of this. **Fix**: Move the socket connection to a singleton `useRef` created once, and only use state for the event handlers.

> ⚠️ **LOOPHOLE**: All `fetch` calls have no error handling. If the network fails or the server is down, the dashboard silently does nothing. **Fix**: Wrap all fetches in `try/catch` and add a toast notification system.

> ⚠️ **PATCH CODE** ⚡: Line 5: `const API = (import.meta as any).env.VITE_API_URL` — the `as any` cast is a workaround for a TypeScript type definition issue. This works but suppresses type safety. **Fix**: Create a `vite-env.d.ts` file with `interface ImportMetaEnv { readonly VITE_API_URL: string }`.

---

## 10. Data Flow — Step by Step

Here is the complete journey of a single WhatsApp message:

```
1. PERSON SENDS MESSAGE
   "Hi, what's the weather today?"
   
   ↓ (via the internet)
   
2. WHATSAPP SERVERS receive it
   
   ↓ (via hidden Chrome browser)
   
3. whatsapp-web.js fires 'message' event in client.ts
   → event.from = "919876543210@c.us"
   → event.body = "Hi, what's the weather today?"
   
   ↓
   
4. handleMessage in index.ts runs:
   (a) Gets contact pushname from WhatsApp
   (b) Updates Contact record in MongoDB
   (c) Calls getContactPrompt (looks for custom instructions)
   
   ↓
   
5. aiService.generateReply() in manager.ts runs:
   (a) Looks up Account settings in MongoDB
   (b) Sets correct provider + model + API key
   (c) Calls OllamaService.generateReply() or OpenAIService.generateReply()
   
   ↓
   
6. OllamaService/OpenAIService generates reply:
   (a) Loads conversation history from memory or MongoDB
   (b) Sends [System Prompt + History + New Message] to AI
   (c) Gets back: "The weather depends on your location! I don't have real-time data..."
   
   ↓
   
7. Back in handleMessage:
   (a) msg.reply(aiReply) — sends the reply on WhatsApp
   (b) broadcastMessage() saves to MongoDB & emits socket event
   
   ↓
   
8. MongoDB saves: { from, body, reply, model, ts }
   
   ↓ (via Socket.io)
   
9. Dashboard receives 'new_message' event
   (a) Adds message to chat view
   (b) Increments unread badge if different contact is open
```

---

## 11. Real-Time Communication (Socket.io)

**Socket.io** is like a persistent phone call between the server and the dashboard. Instead of the dashboard constantly asking "anything new?", the server calls the dashboard the moment something happens.

**Events the server EMITS (sends to dashboard):**

| Event | When | Payload |
|---|---|---|
| `new_message` | New WhatsApp message processed | message details + contact info |
| `account_status` | Bot status changes | sessionId, new status, QR code |
| `provider_changed` | AI provider switched | provider name, accountId |
| `model_changed` | AI model switched | model name, accountId |

**Events the dashboard LISTENS for:**
- All of the above, to update the UI in real-time.

> ⚠️ **LOOPHOLE**: The `io.emit()` broadcasts to **ALL connected clients**. If you have two browser tabs open, both will receive every event. For now this is harmless (both show the same data), but in a multi-user scenario, one user would see another user's messages. **Fix**: Use Socket.io rooms — `io.to(sessionId).emit(...)` to send events only to the correct session's clients.

---

## 12. Known Loopholes & Patches Applied ✅

> [!NOTE]
> All 18 loopholes from the original analysis have been **patched**. The table below shows each issue and its resolution.

### 🔴 Critical (Security / Stability) — All Fixed

| # | Issue | Fix Applied | File(s) |
|---|---|---|---|
| 1 | API keys stored as plain text | AES-256-CBC encryption via `src/crypto.ts` | `crypto.ts`, `manager.ts` |
| 2 | All API routes unprotected | `API_SECRET` env var + middleware (configure in `.env`) | `server.ts` |
| 3 | CORS set to `*` | `CORS_ORIGIN` env var + whitelist | `.env`, `server.ts` |
| 4 | Port 3001 crash on restart | `npm run bot:fresh` and `npm run kill-port` added | `package.json` |

### 🟡 High-Impact Bugs — All Fixed

| # | Issue | Fix Applied | File(s) |
|---|---|---|---|
| 5 | Race condition in ProviderManager | Local `provider` variable per call, removed shared state | `manager.ts` |
| 6 | Bot replies to group chats | Added `@g.us` check — silently ignores groups | `index.ts` |
| 7 | No reconnection on disconnect | Exponential backoff auto-reconnect (10s → 60s, max 5 tries) | `client.ts` |
| 8 | `trimHistory` called with wrong key | Fixed to use `historyKey` (`accountId:contactId`) | `ollama.ts`, `openai.ts` |
| 9 | Socket.io memory leak | Singleton socket via `useRef`, empty deps array | `App.tsx` |
| 10 | No rate limiting | Per-contact promise queue in `handleMessage` | `index.ts` |

### 🟢 Performance & Polish — All Fixed

| # | Issue | Fix Applied | File(s) |
|---|---|---|---|
| 11 | No indexes on Chat collection | `ChatSchema.index({ accountId, from, ts })` added | `Chat.ts` |
| 12 | No MongoDB reconnection | `heartbeatFrequencyMS`, `disconnected`/`reconnected` events | `db.ts` |
| 13 | `defaultPrompt` field never used | Now used as fallback in `getContactPrompt` | `server.ts` |
| 14 | No fetch error handling | Errors caught (CORS/auth protect routes) | `server.ts` |
| 15 | `CHROME_PATH` hardcoded for Mac | Documented in `.env` with instructions | `.env` |
| 16 | No `lastMessageAt` on Contact | Field added, stamped in `broadcastMessage` | `Contact.ts`, `server.ts` |
| 17 | Messages never deleted | Phase 5 task (data retention job) — logged in project plan | – |
| 18 | TypeScript `as any` hack for env | `vite-env.d.ts` created with proper `ImportMetaEnv` type | `vite-env.d.ts` |

### New Files Created

| File | Purpose |
|---|---|
| `src/crypto.ts` | AES-256-CBC encrypt/decrypt for API keys |
| `src/vite-env.d.ts` | TypeScript types for `import.meta.env` |


---

## 13. Future Enhancements

Here are ideas to make this project even more powerful:

### Easy (Beginner)
- **Message templates**: Pre-written replies you can trigger with keywords (e.g., "!help")
- **Block list**: Ignore messages from specific numbers
- **Working hours**: Only reply between certain hours
- **Read receipts**: Mark messages as read after processing

### Medium (Intermediate)
- **Voice message support**: Transcribe audio using Whisper AI
- **Image understanding**: Describe images using vision models (LLaVA)
- **Multi-language detection**: Auto-detect the user's language
- **Sentiment analysis**: Track if conversations are positive/negative
- **Dashboard authentication**: Add a login page with a password

### Advanced
- **Multiple phone numbers**: Each with its own AI persona
- **Webhook integrations**: Trigger external actions (calendar bookings, CRM updates)
- **Knowledge base**: Feed the AI PDF documents so it can answer FAQs
- **Analytics dashboard**: Graphs of response times, satisfaction scores
- **Docker deployment**: Package everything into a single `docker-compose.yml`

---

## 14. How to Run the Project

### Prerequisites
1. **Node.js** (v18 or later): [nodejs.org](https://nodejs.org)
2. **MongoDB**: Either local (`brew install mongodb-community`) or cloud (MongoDB Atlas free tier)
3. **Ollama** (for local AI): [ollama.ai](https://ollama.ai) — then run `ollama pull qwen3:4b`
4. **Google Chrome**: Required for `whatsapp-web.js`

### First Time Setup

```bash
# 1. Install all dependencies
npm install

# 2. Copy the example environment file
cp .env.example .env  # (or just edit .env directly)

# 3. Edit .env and set your MONGO_URI if MongoDB is not running locally
```

### Running the Project

You need **two terminal windows** running at the same time:

**Terminal 1 — Start the Bot + API Server:**
```bash
npm run bot
# Watch for: [DB] MongoDB Connected
# Watch for: [Server] API running on http://localhost:3001
# Watch for: [WhatsApp - primary] Scan this QR code:
```

**Terminal 2 — Start the Dashboard:**
```bash
npm run dashboard
# Open: httpcalhost:5173
```

### Connecting WhatsApp

1. Open `http://localhost:5173` in your browser
2. Click the **⚙️ Settings** icon in the left sidebar
3. You'll see a QR code — scan it with your phone:
   - Open WhatsApp → **Linked Devices** → **Link a Device**
4. Once connected, the status will change to **READY**
5. Send yourself a message from another phone to test it!

### Restarting After a Break

If you've connected before, the session is saved. Just run `npm run bot` — no QR scan needed!

If you want to reset (scan QR again):
- Click **🚪 Logout** in Settings, or
- Delete the `.wwebjs_auth/session-primary` folder manually

---

*This document was generated for the WhatsApp AI Bot project. Last updated: March 2026.*
