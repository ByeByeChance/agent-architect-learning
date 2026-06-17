import { createChatClient, appConfig } from "../api-client/config";
import { weatherTool, getWeather } from "./weather-tool";

const ai = createChatClient();

async function main() {
  console.log(`🔧 Provider: ${appConfig.provider} | Query: "${appConfig.toolCall.query}"\n`);

  if (ai.type !== "openai-compatible") {
    console.log("Function Calling 仅支持 OpenAI 兼容 API (DeepSeek/OpenAI)");
    return;
  }

  const response = await ai.client.chat.completions.create({
    model: ai.model,
    messages: [{ role: "user", content: appConfig.toolCall.query }],
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

    const finalResponse = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "user", content: appConfig.toolCall.query },
        choice.message,
        ...toolMessages,
      ],
    });

    console.log("🤖 最终回答:", finalResponse.choices[0].message.content);
  } else {
    console.log("ℹ️ 模型未调用工具，直接回答:", choice.message.content);
  }
}

main().catch(console.error);
