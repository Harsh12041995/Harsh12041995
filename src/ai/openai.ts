import axios from 'axios';
import { AIService, ChatMessage } from './types';

export class OpenAIService implements AIService {
  private apiKey: string | null = null;
  private model: string = 'gpt-3.5-turbo';
  private systemPrompt: string;
  private histories: Map<string, ChatMessage[]> = new Map();
  private readonly MAX_HISTORY = 10;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || null;
    this.systemPrompt =
      process.env.OLLAMA_SYSTEM_PROMPT ||
      'You are a helpful WhatsApp assistant. Keep replies concise and conversational.';
  }

  async generateReply(contactId: string, userMessage: string, customPrompt?: string): Promise<string> {
    if (!this.apiKey) {
      return '⚠️ Cloud AI Provider is active but no API Key is set. Please configure an API Key in the dashboard.';
    }

    const history = this.getHistory(contactId);
    history.push({ role: 'user', content: userMessage });

    const messages: ChatMessage[] = [
      { role: 'system', content: customPrompt || "You are a professional assistant. Maintain a human-like, warm, and helpful conversation style. Keep your replies very concise and brief. Do not provide overly long explanations unless asked." },
      ...history,
    ];

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const reply = response.data.choices[0].message.content.trim();
      history.push({ role: 'assistant', content: reply });
      this.trimHistory(contactId);

      return reply;
    } catch (error: any) {
      console.error(`[OpenAI] Error: ${error.message}`);
      if (error.response?.status === 401) return '⚠️ Invalid API Key.';
      if (error.response?.status === 429) return '⚠️ Rate limit exceeded.';
      return '⚠️ Cloud AI error. Check your API key and network.';
    }
  }

  async listModels(): Promise<string[]> {
    return ['gpt-3.5-turbo', 'gpt-4', 'gpt-4o-mini', 'gpt-4-turbo'];
  }

  setModel(model: string): void {
    this.model = model;
    console.log(`[OpenAI] Switched to model: ${model}`);
  }

  getModel(): string {
    return this.model;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
    console.log('[OpenAI] API Key updated.');
  }

  private getHistory(contactId: string): ChatMessage[] {
    if (!this.histories.has(contactId)) {
      this.histories.set(contactId, []);
    }
    return this.histories.get(contactId)!;
  }

  private trimHistory(contactId: string): void {
    const history = this.histories.get(contactId);
    if (history && history.length > this.MAX_HISTORY * 2) {
      this.histories.set(contactId, history.slice(-this.MAX_HISTORY * 2));
    }
  }
}
