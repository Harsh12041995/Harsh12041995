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
        ],
      },
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
    });

    await this.client.initialize();
  }

  isReady(): boolean {
    return this.ready;
  }
  
  getSessionId(): string {
    return this.sessionId;
  }
}
