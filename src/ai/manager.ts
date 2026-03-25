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
    const { ToolRouter, toolRegistry } = await import('./tools');
    const router = new ToolRouter();

    // ── Tier 1: Regex Router (0 GPU) ──
    const fastReply = await router.routeByRegex(userMessage);
    if (fastReply) {
      console.log(`[AI] Regex Router bypassed LLM for: "${userMessage}"`);
      return fastReply;
    }

    const provider: ProviderType = (acc?.provider as ProviderType) || 'ollama';
    const service = provider === 'ollama' ? this.ollama : this.openai;

    if (acc?.model) service.setModel(acc.model);
    if (provider === 'openai' && acc?.apiKey) {
      this.openai.setApiKey(decrypt(acc.apiKey));
    }

    // Prepare tools with context (keys)
    const context = {
      serperKey: acc?.serperKey ? decrypt(acc.serperKey) : undefined,
      newsKey: acc?.newsKey ? decrypt(acc.newsKey) : undefined
    };

    // ── Tier 2: LLM Tool Selection & Execution ──
    // Note: For now, we perform a simple tool check. In the future, we can expand
    // this to support full multi-turn tool use if the model supports it well.
    let response = await service.generateReply(accountId, contactId, userMessage, customPrompt);

    // Basic Tool Call Detection (for Ollama Qwen3/similar)
    // We expect the model to output something like: <call:tool_name>{"arg": "val"}</call>
    const toolCallMatch = response.match(/<call:(\w+)>(.*?)<\/call>/s);
    if (toolCallMatch) {
      const [, toolName, argsJson] = toolCallMatch;
      const tool = toolRegistry[toolName];
      if (tool) {
        console.log(`[AI] Tool Call: ${toolName}(${argsJson})`);
        try {
          const args = JSON.parse(argsJson);
          const toolResult = await tool.execute({ ...args, apiKey: toolName === 'google_search' ? context.serperKey : context.newsKey });
          
          // Re-feed the tool result to the AI for a final summarized answer
          const followUpPrompt = `${customPrompt || ''}\n\nTool Result (${toolName}): ${toolResult}\n\nBased on this result, provide a final concise answer to the user.`;
          return await service.generateReply(accountId, contactId, `[TOOL_RESULT] ${toolResult}`, followUpPrompt);
        } catch (err) {
          console.error(`[AI] Tool execution failed:`, err);
          return "I encountered an error while trying to look that up for you.";
        }
      }
    }

    return response;
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
