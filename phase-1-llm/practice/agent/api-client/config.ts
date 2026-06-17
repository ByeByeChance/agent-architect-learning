import "dotenv/config";

export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-3-5-haiku-latest",
  },
} as const;

if (!config.openai.apiKey && !config.anthropic.apiKey) {
  console.error("❌ 至少配置一个 API Key (OPENAI_API_KEY 或 ANTHROPIC_API_KEY)");
  process.exit(1);
}
