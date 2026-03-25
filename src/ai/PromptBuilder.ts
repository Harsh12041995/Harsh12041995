/**
 * PromptBuilder — Orchestrates the assembly of AI system prompts.
 * Merges Identity, Tools, Scenarios, Global Knowledge, and Long-term Summary.
 */
export class PromptBuilder {
  static build(params: {
    sessionId: string;
    bio?: string;
    globalContext?: string;
    knowledgeBase?: string;
    contactContext?: string;
    category?: string;
    chatStyle?: string;
    summary?: string;
  }): string {
    const { sessionId, bio, globalContext, knowledgeBase, contactContext, category, chatStyle, summary } = params;

    const sections: string[] = [];

    // 1. Identity & Role
    sections.push(`IDENTITY:
You are representing ${sessionId === 'primary' ? 'Harsh' : sessionId}.
Your personality bio: ${bio || 'Professional and helpful.'}
Global Instructions: ${globalContext || 'Maintain a human-like, warm, and helpful style. Keep replies concise.'}`);

    // 2. Scenario-based Instructions
    const scenarioRules = this.getScenarioRules(category || 'Casual', chatStyle || 'friendly');
    sections.push(`SCENARIO & STYLE:
Category: ${category || 'Casual'}
Style: ${chatStyle || 'friendly'}
Rules: ${scenarioRules}`);

    // 3. Knowledge Base (RAG-lite hint)
    if (knowledgeBase) {
      sections.push(`KNOWLEDGE BASE:
${knowledgeBase}`);
    }

    // 4. Long-term memory (Summary)
    if (summary) {
      sections.push(`INTERACTION SUMMARY (Long-term Context):
${summary}`);
    }

    // 5. Contact-specific Context
    if (contactContext) {
      sections.push(`CONTACT SPECIFIC NOTES:
${contactContext}`);
    }

    // 6. Core Tools (Standardized)
    sections.push(`AVAILABLE TOOLS:
- get_weather(location): Get current weather.
- wikipedia_search(query): Search Wikipedia for knowledge.
- calculate(expression): Perform math (e.g. 1.15 * 1250).
- dictionary_lookup(word): Define a word.
- google_search(query): Search Google for real-time info.
- get_news(category): Get news headlines.
- get_time(timezone): Get current time.

TOOL RULES:
- If you need real-time info or a tool, respond ONLY with: <call:tool_name>{"arg": "val"}</call>
- Otherwise, respond normally.`);

    // 7. Approval Rules (Business Logic)
    sections.push(`CRITICAL APPROVAL RULES:
1. If the user asks for a commitment, availability, personal meeting, or specific action that isn't explicitly mentioned as "Allowed" in your identity/bio, DO NOT reply directly.
2. Instead, prefix your response with [APPROVE] followed by a suggested draft.
3. Example: "[APPROVE] I check with Harsh and get back to you soon."`);

    return sections.join('\n\n');
  }

  private static getScenarioRules(category: string, style: string): string {
    switch (category) {
      case 'Professional':
        return "- Use formal language. Avoid emojis. Stay strictly on topic. Be polite but brief.";
      case 'Client':
        return "- Be extremely helpful and proactive. Always maintain a professional tone. Prioritize solving their issue.";
      case 'Casual':
        return "- Use a relaxed tone. Emojis are welcome. Feel free to be more conversational.";
      case 'Friend':
        return "- High level of familiarity. Short, punchy replies. Use slang if appropriate.";
      case 'Family':
        return "- Warm and caring. No need for professional boundaries.";
      default:
        return "- Adaptive style based on conversation flow.";
    }
  }
}
