import { createChatClient, appConfig } from "../api-client/config";

const ai = createChatClient();

async function main() {
  console.log(`🔬 Provider: ${appConfig.provider} | Model: ${ai.model}\n`);
  console.log(`   Prompt: "${appConfig.experiment.prompt}"\n`);

  for (const temp of appConfig.experiment.temperatures) {
    console.log(`--- Temperature = ${temp} ---`);
    const responses: string[] = [];
    for (let i = 0; i < appConfig.experiment.runsPerTemp; i++) {
      // DeepSeek/OpenAI 兼容方式
      if (ai.type === "openai-compatible") {
        const res = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [{ role: "user", content: appConfig.experiment.prompt }],
          temperature: temp,
        });
        responses.push(res.choices[0].message.content!);
      } else {
        const text = await ai.chat(appConfig.experiment.prompt);
        responses.push(text!);
      }
    }
    responses.forEach((r, i) => console.log(`  第${i + 1}次: ${r}`));
    const unique = new Set(responses).size;
    console.log(`  多样性: ${unique}/${appConfig.experiment.runsPerTemp}\n`);
  }
}

main().catch(console.error);
