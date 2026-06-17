import "dotenv/config";

export const config = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY!,
    model: "deepseek-chat",
    baseURL: "https://api.deepseek.com",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-3-5-haiku-latest",
  },
} as const;

const anyKey = config.deepseek.apiKey || config.openai.apiKey || config.anthropic.apiKey;
if (!anyKey) {
  console.error("❌ 至少配置一个 API Key (DEEPSEEK_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)");
  process.exit(1);
}
