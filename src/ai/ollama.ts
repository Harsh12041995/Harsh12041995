import { Ollama } from 'ollama';
import { AIService, ChatMessage } from './types';

export class OllamaService implements AIService {
  private client: Ollama;
  private model: string;
  private systemPrompt: string;
  // Per-contact conversation history (contactId -> messages)
  private histories: Map<string, ChatMessage[]> = new Map();
  private readonly MAX_HISTORY = 10; // messages to keep per contact

  constructor() {
    this.client = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });
    this.model = process.env.OLLAMA_MODEL || 'qwen3:4b';
    this.systemPrompt =
      process.env.OLLAMA_SYSTEM_PROMPT ||
      "You are a professional assistant. Maintain a human-like, warm, and helpful conversation style. Keep your replies very concise and brief. Do not provide overly long explanations unless asked.";
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Generate a reply for a given contact, maintaining conversation history
   * so the model has context from previous messages in the chat.
   */
  async generateReply(accountId: string, contactId: string, userMessage: string, customPrompt?: string): Promise<string> {
    const historyKey = `${accountId}:${contactId}`;
    const history = this.getHistory(historyKey);

    // If history is empty, try to populate it from the database
    if (history.length === 0) {
      const { Chat } = await import('../models/Chat');
      const savedMessages = await Chat.find({ accountId, from: contactId }).sort({ ts: -1 }).limit(this.MAX_HISTORY);
      
      // Convert saved messages to ChatMessage format and add to history
      // Note: we reverse to get them in chronological order
      for (const msg of savedMessages.reverse()) {
        history.push({ role: 'user', content: msg.body });
        history.push({ role: 'assistant', content: msg.reply });
      }
    }

    // Add the new user message to history
    history.push({ role: 'user', content: userMessage });

    const messages: ChatMessage[] = [
      { role: 'system', content: customPrompt || this.systemPrompt },
      ...history,
    ];

    try {
      const response = await this.client.chat({
        model: this.model,
        messages,
      });

      const reply = response.message.content.trim();

      // Add assistant reply to history and trim to prevent unbounded growth
      history.push({ role: 'assistant', content: reply });
      this.trimHistory(historyKey); // ✅ Fix: was contactId (wrong), now historyKey (correct)

      return reply;
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[Ollama] Error generating reply: ${err.message}`);

      // If model not found, give an actionable error
      if (err.message?.includes('model') && err.message?.includes('not found')) {
        return `⚠️ AI model "${this.model}" not found. Run: ollama pull ${this.model}`;
      }
      if (err.message?.includes('ECONNREFUSED')) {
        return '⚠️ Cannot reach Ollama. Make sure it is running: ollama serve';
      }

      return '⚠️ Sorry, I could not process your message right now.';
    }
  }

  /**
   * List all models currently available on the local Ollama instance.
   * Useful for the dashboard model-picker.
   */
  async listModels(): Promise<string[]> {
    try {
      const res = await this.client.list();
      return res.models.map((m: { name: string }) => m.name);
    } catch {
      return [];
    }
  }

  /** Switch model at runtime (e.g. from dashboard) */
  setModel(model: string): void {
    this.model = model;
    console.log(`[Ollama] Switched to model: ${model}`);
  }

  getModel(): string {
    return this.model;
  }

  /** Clear conversation history for a specific contact */
  clearHistory(contactId: string): void {
    this.histories.delete(contactId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private getHistory(contactId: string): ChatMessage[] {
    if (!this.histories.has(contactId)) {
      this.histories.set(contactId, []);
    }
    return this.histories.get(contactId)!;
  }

  /** Trim history to MAX_HISTORY pairs to keep RAM usage bounded. */
  private trimHistory(historyKey: string): void {
    const history = this.histories.get(historyKey);
    if (history && history.length > this.MAX_HISTORY * 2) {
      this.histories.set(historyKey, history.slice(-this.MAX_HISTORY * 2));
    }
  }
}
