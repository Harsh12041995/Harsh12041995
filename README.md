# WhatsApp AI Bot — Local Ollama Edition

Auto-replies to WhatsApp messages using a **fully local Ollama model**.  
No API keys. No rate limits. No cloud. Runs entirely on your machine.

---

## How It Works

```
WhatsApp (your phone)
     ↕  WebSocket
whatsapp-web.js          ← manages WA Web session, emits typed events
     ↓  message event
Bot Core (src/index.ts)  ← receives Message object, calls Ollama
     ↓  chat()
Ollama (local)           ← qwen3:4b / llama3.2 / mistral / etc.
     ↓  reply text
msg.reply()              ← sends response back to WhatsApp chat
     ↓  broadcast
Express + Socket.io      ← pushes live update to dashboard
     ↓
React Dashboard          ← http://localhost:5173
```

---

## Prerequisites

| Requirement | Install |
|---|---|
| Node.js 18+ | https://nodejs.org |
| Ollama | https://ollama.com/download |

---

## Quick Start

### 1. Install Ollama and pull a model

```bash
# Install Ollama, then pull your chosen model
ollama pull qwen3:4b        # fast, ~2GB RAM  ← recommended
# ollama pull llama3.2      # balanced, ~5GB RAM
# ollama pull mistral       # strong reasoning, ~4GB RAM
# ollama pull gemma3:4b     # Google compact, ~3GB RAM

# Verify it works
ollama run qwen3:4b "Say hello"
```

### 2. Install dependencies

```bash
npm install
`

### 3. Configure `.env`

```bash
cp .env.example .env   # or edit .env directly
```

Key settings:
```
OLLAMA_MODEL=qwen3:4b          # change to any model you've pulled
OLLAMA_HOST=http://localhost:11434
OLLAMA_SYSTEM_PROMPT=You are a helpful WhatsApp assistant. Keep replies concise.
```

### 4. Build

```bash
npm run build
```

### 5. Start everything (2 terminals)

**Terminal 1 — Bot & API**
```bash
npm run bot
```

**Terminal 2 — Dashboard**
```bash
npm run dashboard
```

On first run, a QR code appears in Terminal 3.  
Scan it once with your WhatsApp app → session is saved → **never scan again**.

---

## Switching Models

### Via Dashboard (runtime, no restart needed)
Open http://localhost:5173 → click any available model button.

### Via API
```bash
curl -X POST http://localhost:3001/api/model \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3.2"}'
```

### Via .env (persistent)
Change `OLLAMA_MODEL=llama3.2` and restart.

---

## Available Local Models

```bash
ollama list                    # see what you have pulled
ollama pull <model>            # pull a new model
```

| Model | RAM | Speed | Good for |
|---|---|---|---|
| `qwen3:4b` | ~2GB | Fast | General chat, multilingual |
| `llama3.2` | ~5GB | Medium | Balanced quality/speed |
| `mistral` | ~4GB | Medium | Reasoning, Q&A |
| `gemma3:4b` | ~3GB | Fast | Conversation |
| `phi4-mini` | ~2.5GB | Fast | Compact, efficient |

---

## File Structure

```
src/
  index.ts              ← entry point, wires everything together
  server.ts             ← Express + Socket.io API
  whatsapp/
    client.ts           ← whatsapp-web.js wrapper (event-based, zero selectors)
  ai/
    ollama.ts           ← Ollama service with per-contact conversation history
  dashboard/
    App.tsx             ← React dashboard with live feed + model switcher
    main.tsx
    index.css
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| QR appears on every restart | Keep `.wwebjs_auth/` on disk, don't delete it |
| `model not found` error | Run `ollama pull <model>` first |
| `ECONNREFUSED` to Ollama | Run `ollama serve` in a separate terminal |
| No replies from bot | Check `msg.fromMe` filter; confirm Ollama is running |
| Puppeteer launch error | Add `--no-sandbox` flag (already set in client.ts) |

### Reset WhatsApp session
```bash
rm -rf .wwebjs_auth/
npm start   # scan QR again
```

---

## Security Notes

- **Never commit `.wwebjs_auth/`** — it contains your WhatsApp session credentials.
- **Never commit `.env`** — both are in `.gitignore`.
- The bot replies to **all incoming messages** by default. Add contact filtering in `src/index.ts` if needed.
