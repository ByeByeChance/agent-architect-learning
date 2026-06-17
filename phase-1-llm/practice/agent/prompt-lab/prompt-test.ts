import { createChatClient, appConfig } from "../api-client/config";
import fs from "fs";
import path from "path";

const ai = createChatClient();
const systemPrompt = fs.readFileSync(
  path.join(__dirname, "prompt-versions", `${appConfig.promptTest.systemPromptVersion}.md`),
  "utf-8"
);

async function main() {
  console.log(`🧪 Provider: ${appConfig.provider} | Prompt: ${appConfig.promptTest.systemPromptVersion}\n`);

  let passed = 0;
  for (const tc of appConfig.promptTest.testCases) {
    let output = "";

    if (ai.type === "openai-compatible") {
      const res = await ai.client.chat.completions.create({
        model: ai.model,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: tc.input },
        ],
      });
      output = res.choices[0].message.content!;
    } else {
      output = (await ai.chat(tc.input, systemPrompt))!;
    }

    const pass = output.length > 10;
    console.log(`${pass ? "✅" : "❌"} ${tc.input.slice(0, 40)}...`);
    console.log(`   输出: ${output.slice(0, 120)}...\n`);
    if (pass) passed++;
  }
  console.log(`${passed}/${appConfig.promptTest.testCases.length} 通过`);
}

main().catch(console.error);
