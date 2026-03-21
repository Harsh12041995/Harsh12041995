import { AIService, ProviderType } from './types';
import { OllamaService } from './ollama';
import { OpenAIService } from './openai';
import { decrypt } from '../crypto';

export class ProviderManager implements AIService {
  private ollama: OllamaService;
  private openai: OpenAIService;
  private currentProvider: ProviderType = 'ollama';

  constructor() {
    this.ollama = new OllamaService();
    this.openai = new OpenAIService();
  }

  // ── AIService Implementation ──────────────────────────────────────────────

  async generateReply(accountId: string, contactId: string, userMessage: string, customPrompt?: string): Promise<string> {
    const { Account } = await import('../models/Account');
    const acc = await Account.findOne({ sessionId: accountId });

    // ✅ Fix (Task 2.2): Use a local provider variable, NOT this.currentProvider,
    // to avoid race conditions when two sessions process messages simultaneously.
    const provider: ProviderType = (acc?.provider as ProviderType) || 'ollama';
    const service = provider === 'ollama' ? this.ollama : this.openai;

    if (acc?.model) service.setModel(acc.model);
    if (provider === 'openai' && acc?.apiKey) {
      // Decrypt the API key before passing it to the service
      this.openai.setApiKey(decrypt(acc.apiKey));
    }

    return service.generateReply(accountId, contactId, userMessage, customPrompt);
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
