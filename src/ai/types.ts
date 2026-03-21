export type ProviderType = 'ollama' | 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIService {
  generateReply(accountId: string, contactId: string, userMessage: string, customPrompt?: string): Promise<string>;
  listModels(): Promise<string[]>;
  setModel(model: string): void;
  getModel(): string;
  setApiKey?(key: string): void;
}
