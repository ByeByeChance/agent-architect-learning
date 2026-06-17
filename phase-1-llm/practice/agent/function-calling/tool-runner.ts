import OpenAI from "openai";
import "dotenv/config";
import { weatherTool, getWeather } from "./weather-tool";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function main() {
  const userMessage = "北京和上海的天气怎么样？";

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: userMessage }],
    tools: [weatherTool],
  });

  const choice = response.choices[0];

  if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
    console.log("🔧 模型决定调用工具:\n");

    const toolMessages = [];
    for (const toolCall of choice.message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(`  调用: get_weather(${args.city})`);
      const result = await getWeather(args.city);
      console.log(`  结果: ${result}\n`);

      toolMessages.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: userMessage },
        choice.message,
        ...toolMessages,
      ],
    });

    console.log("🤖 最终回答:", finalResponse.choices[0].message.content);
  }
}

main().catch(console.error);
