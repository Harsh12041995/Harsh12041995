import { AIService, ProviderType } from './types';
import { OllamaService } from './ollama';
import { OpenAIService } from './openai';

export class ProviderManager implements AIService {
  private ollama: OllamaService;
  private openai: OpenAIService;
  private currentProvider: ProviderType = 'ollama';

  constructor() {
    this.ollama = new OllamaService();
    this.openai = new OpenAIService();
  }

  // ── AIService Implementation ──────────────────────────────────────────────

  async generateReply(contactId: string, userMessage: string, customPrompt?: string): Promise<string> {
    return this.activeService().generateReply(contactId, userMessage, customPrompt);
  }

  async listModels(): Promise<string[]> {
    return this.activeService().listModels();
  }

  setModel(model: string): void {
    this.activeService().setModel(model);
  }

  getModel(): string {
    return this.activeService().getModel();
  }

  setApiKey(key: string): void {
    this.openai.setApiKey(key);
  }

  // ── Provider Management ───────────────────────────────────────────────────

  setProvider(provider: ProviderType): void {
    this.currentProvider = provider;
    console.log(`[Provider] Switched to provider: ${provider}`);
  }

  getProvider(): ProviderType {
    return this.currentProvider;
  }

  private activeService(): AIService {
    return this.currentProvider === 'ollama' ? this.ollama : this.openai;
  }
}
