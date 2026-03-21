import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import type { Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

export type MessageHandler = (msg: Message) => Promise<void>;
export type StatusHandler = (status: 'qr' | 'authenticated' | 'ready' | 'disconnected', data?: string) => void;

export class WhatsAppClient {
  private client: any;
  private ready = false;
  private sessionId: string;
  private retryCount = 0;       // Track reconnection attempts
  private readonly MAX_RETRIES = 5; // Give up after 5 failed reconnections

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId, // This creates separate folders in .wwebjs_auth
        dataPath: process.env.SESSION_PATH || './.wwebjs_auth',
      }),
      puppeteer: {
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: process.env.HEADLESS !== 'false',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      authTimeoutMs: 60000, // Increase timeout to 60s
    });
  }

  async initialize(
    onMessage: MessageHandler,
    onStatus?: StatusHandler
  ): Promise<void> {
    this.client.on('qr', (qr: string) => {
      console.log(`\n[WhatsApp - ${this.sessionId}] Scan this QR code:\n`);
      qrcode.generate(qr, { small: true });
      onStatus?.('qr', qr);
    });

    this.client.on('authenticated', () => {
      console.log(`[WhatsApp - ${this.sessionId}] Session restored.`);
      onStatus?.('authenticated');
    });

    this.client.on('ready', () => {
      console.log(`[WhatsApp - ${this.sessionId}] Bot is ready.`);
      this.ready = true;
      this.retryCount = 0; // ✅ Reset retry counter on successful connection
      onStatus?.('ready');
    });

    this.client.on('message', async (msg: Message) => {
      if (msg.fromMe) return;
      if (msg.from === 'status@broadcast') return;

      try {
        await onMessage(msg);
      } catch (err) {
        console.error(`[WhatsApp - ${this.sessionId}] Error:`, err);
      }
    });

    this.client.on('disconnected', (reason: string) => {
      console.warn(`[WhatsApp - ${this.sessionId}] Disconnected:`, reason);
      this.ready = false;
      onStatus?.('disconnected', reason);

      // ✅ Task 2.5 — Auto-reconnect with exponential backoff
      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        const delay = Math.min(10000 * this.retryCount, 60000); // 10s, 20s, 30s... max 60s
        console.log(`[WhatsApp - ${this.sessionId}] Reconnecting in ${delay/1000}s (attempt ${this.retryCount}/${this.MAX_RETRIES})...`);
        setTimeout(() => {
          this.client.initialize().catch((err: Error) => {
            console.error(`[WhatsApp - ${this.sessionId}] Reconnect failed:`, err.message);
          });
        }, delay);
      } else {
        console.error(`[WhatsApp - ${this.sessionId}] Max reconnect attempts reached. Manual restart needed.`);
      }
    });

    await this.client.initialize();
  }

  isReady(): boolean {
    return this.ready;
  }
  
  getClient(): any {
    return this.client;
  }

  async logout(): Promise<void> {
    try {
      await this.client.logout();
      console.log(`[WhatsApp - ${this.sessionId}] Logged out.`);
    } catch (err) {
      console.warn(`[WhatsApp - ${this.sessionId}] Logout error:`, err);
    } finally {
      this.ready = false;
    }
  }

  async destroy(): Promise<void> {
    try {
      await this.client.destroy();
      console.log(`[WhatsApp - ${this.sessionId}] Client destroyed.`);
    } catch (err) {
      console.warn(`[WhatsApp - ${this.sessionId}] Destroy error:`, err);
    } finally {
      this.ready = false;
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
