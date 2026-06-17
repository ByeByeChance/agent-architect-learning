import OpenAI from "openai";
import { config } from "./config";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

async function chat(prompt: string) {
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0].message.content;
}

async function main() {
  const result = await chat("用一句话解释什么是 API");
  console.log("✅ OpenAI 响应:", result);
}

main().catch(console.error);
