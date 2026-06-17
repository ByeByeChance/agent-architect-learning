import OpenAI from "openai";
import { appConfig } from "./config";

const deepseek = new OpenAI({
  apiKey: appConfig.providers.deepseek.apiKey,
  baseURL: appConfig.providers.deepseek.baseURL,
});

async function chat(prompt: string) {
  const response = await deepseek.chat.completions.create({
    model: appConfig.providers.deepseek.model,
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0].message.content;
}

async function main() {
  const result = await chat("用一句话解释什么是 API");
  console.log("✅ DeepSeek 响应:", result);
}

main().catch(console.error);
