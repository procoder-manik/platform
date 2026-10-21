import type { AiAdapter } from './types';

export type { AiAdapter, AiProvider, AiRequest, AiResult } from './types';

/** Placeholder until Phase 11 adds Gemini, Groq, OpenRouter, OpenAI and Anthropic with failover. */
export const ai: AiAdapter = {
  async ask() {
    return {
      ok: false,
      text: '',
      error: { kind: 'none', message: 'No AI provider is set up yet. Add a key in Admin > AI > API keys.' },
    };
  },
};
