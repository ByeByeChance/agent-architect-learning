/**
 * Anthropic 策略 — 需要注意 System Prompt 的处理方式与 OpenAI 不同：
 * Anthropic 的 system 是顶层参数，不是 messages 数组里的一个 role。
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMStrategy, ChatMessage, ChatOptions, ChatResult } from "../types.js";
import { getProviderConfig } from "../config.js";

export class AnthropicStrategy implements LLMStrategy {
  readonly provider = "anthropic" as const;
  readonly model: string;
  private client: Anthropic;

  constructor() {
    const cfg = getProviderConfig("anthropic");
    this.model = cfg.model;
    this.client = new Anthropic({ apiKey: cfg.apiKey });
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResult> {
    const start = Date.now();

    // Anthropic API：system 是顶层参数，不在 messages 数组中
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const userMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || 2000,
      temperature: options?.temperature ?? 0,
      system: systemMsg,
      messages: userMsgs,
    });

    const content = res.content[0];

    return {
      content: content.type === "text" ? content.text : JSON.stringify(content),
      model: this.model,
      provider: "anthropic",
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
      latencyMs: Date.now() - start,
    };
  }
}
