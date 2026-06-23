/**
 * api-client 共享类型
 */

export type Provider = "deepseek" | "openai" | "anthropic";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  provider: Provider;
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

/** 所有 Provider 策略必须实现此接口 */
export interface LLMStrategy {
  readonly provider: Provider;
  readonly model: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
}
