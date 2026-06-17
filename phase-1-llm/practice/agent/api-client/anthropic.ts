import Anthropic from "@anthropic-ai/sdk";
import { appConfig } from "./config";

const anthropic = new Anthropic({ apiKey: appConfig.providers.anthropic.apiKey });

async function chat(prompt: string) {
  const response = await anthropic.messages.create({
    model: appConfig.providers.anthropic.model,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  const content = response.content[0];
  return content.type === "text" ? content.text : JSON.stringify(content);
}

async function main() {
  const result = await chat("用一句话解释什么是 API");
  console.log("✅ Anthropic 响应:", result);
}

main().catch(console.error);
