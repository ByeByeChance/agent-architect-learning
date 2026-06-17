import OpenAI from "openai";
import "dotenv/config";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const PROMPT = "用一句话描述'春天'的感觉。";
const TEMPERATURES = [0, 0.3, 0.7, 1.0, 1.5];

async function testTemperature(temp: number) {
  const responses: string[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: PROMPT }],
      temperature: temp,
    });
    responses.push(res.choices[0].message.content!);
  }
  return responses;
}

async function main() {
  console.log(`🔬 Temperature 实验: "${PROMPT}"\n`);

  for (const temp of TEMPERATURES) {
    console.log(`--- Temperature = ${temp} ---`);
    const results = await testTemperature(temp);
    results.forEach((r, i) => console.log(`  第${i + 1}次: ${r}`));
    const unique = new Set(results).size;
    console.log(`  多样性: ${unique}/3 种不同回答\n`);
  }
}

main().catch(console.error);
