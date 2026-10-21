export interface AiRequest {
  system?: string;
  prompt: string;
  /** Ask for JSON; the answer is parsed tolerantly and normalised before use. */
  json?: boolean;
  maxTokens?: number;
  /** Total time budget for all providers together. */
  timeoutMs?: number;
}

export interface AiResult {
  ok: boolean;
  text: string;
  provider?: string;
  model?: string;
  error?: { kind: 'auth' | 'quota' | 'model' | 'timeout' | 'truncated' | 'none' | 'unknown'; message: string };
}

export interface AiProvider {
  readonly id: string;
  readonly free: boolean;
  listModels(apiKey: string): Promise<string[]>;
  call(apiKey: string, model: string, request: AiRequest): Promise<string>;
}

export interface AiAdapter {
  ask(request: AiRequest): Promise<AiResult>;
}
