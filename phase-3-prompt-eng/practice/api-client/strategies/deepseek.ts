/**
 * DeepSeek 策略 — 使用 OpenAI 兼容 SDK
 */

import OpenAI from "openai";
import type { LLMStrategy, ChatMessage, ChatOptions, ChatResult } from "../types.js";
import { getProviderConfig } from "../config.js";

export class DeepSeekStrategy implements LLMStrategy {
  readonly provider = "deepseek" as const;
  readonly model: string;
  private client: OpenAI;

  constructor() {
    const cfg = getProviderConfig("deepseek");
    this.model = cfg.model;
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL || "https://api.deepseek.com",
    });
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResult> {
    const start = Date.now();

    const res = await this.client.chat.completions.create({
      model: this.model,
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens || 2000,
      messages: messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
    });

    return {
      content: res.choices[0]?.message?.content || "",
      model: this.model,
      provider: "deepseek",
      usage: {
        inputTokens: res.usage?.prompt_tokens || 0,
        outputTokens: res.usage?.completion_tokens || 0,
      },
      latencyMs: Date.now() - start,
    };
  }
}
