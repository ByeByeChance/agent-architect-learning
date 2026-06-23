/**
 * api-client 统一入口
 *
 * 工厂模式：根据 provider 返回对应的策略实例。
 * 所有调用方只依赖 LLMStrategy 接口，不感知具体 provider 实现。
 */

import type { Provider, LLMStrategy } from "./types.js";
import { appConfig } from "./config.js";
import { DeepSeekStrategy } from "./strategies/deepseek.js";
import { OpenAIStrategy } from "./strategies/openai.js";
import { AnthropicStrategy } from "./strategies/anthropic.js";

// 策略实例缓存（单例，避免重复创建 SDK client）
const cache = new Map<Provider, LLMStrategy>();

function createStrategy(provider: Provider): LLMStrategy {
  switch (provider) {
    case "deepseek":
      return new DeepSeekStrategy();
    case "openai":
      return new OpenAIStrategy();
    case "anthropic":
      return new AnthropicStrategy();
  }
}

/**
 * 获取 LLM 策略实例（带缓存）。
 * @param provider - 不传则使用环境变量 AI_PROVIDER 的默认值
 */
export function createLLMClient(provider?: Provider): LLMStrategy {
  const p = provider || appConfig.defaultProvider;
  if (!cache.has(p)) {
    cache.set(p, createStrategy(p));
  }
  return cache.get(p)!;
}

export type { Provider, LLMStrategy, ChatMessage, ChatOptions, ChatResult } from "./types.js";
export { getProviderConfig, appConfig } from "./config.js";
