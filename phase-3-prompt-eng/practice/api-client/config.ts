/**
 * 配置中心 — 从 .env 读取，统一管理所有 Provider 配置
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import type { Provider } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export const appConfig = {
  /** 默认 provider，通过 AI_PROVIDER 环境变量切换 */
  defaultProvider: (process.env.AI_PROVIDER || "deepseek") as Provider,

  providers: {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      baseURL: "https://api.deepseek.com",
    } as ProviderConfig,

    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    } as ProviderConfig,

    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
    } as ProviderConfig,
  },
} as const;

/** 获取指定 provider 的配置，校验 API Key */
export function getProviderConfig(provider?: Provider): ProviderConfig {
  const p = provider || appConfig.defaultProvider;
  const cfg = appConfig.providers[p];
  if (!cfg.apiKey) {
    throw new Error(
      `❌ 未配置 ${p.toUpperCase()}_API_KEY，请在 .env 中设置`
    );
  }
  return cfg;
}
