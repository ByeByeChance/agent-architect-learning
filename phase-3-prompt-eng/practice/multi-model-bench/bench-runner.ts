/**
 * 多模型 Prompt 效果对比 Runner
 *
 * 同一套 Prompt 在 DeepSeek / OpenAI / Anthropic 上跑，横向对比：
 * 1. 格式遵循度 (Format Compliance)
 * 2. 内容完整性 (Content Completeness)
 * 3. 指令安全遵守 (Safety Compliance)
 * 4. 延迟 (Latency)
 * 5. 成本 (Cost, 估算)
 *
 * 用法：
 *   npx tsx bench-runner.ts                        — 跑所有 benchmark
 *   npx tsx bench-runner.ts --category=format      — 只跑格式类
 *   npx tsx bench-runner.ts --models=deepseek,openai — 指定模型
 *   npx tsx bench-runner.ts --prompt=BENCH-FMT-01  — 跑指定 prompt
 */

import { createLLMClient, Provider } from "../api-client/index.js";
import { BENCH_PROMPTS, BenchPrompt } from "./prompts/bench-prompts.js";

// ===== Types =====

interface EvalResult {
  formatScore: number; // 0-1
  contentScore: number; // 0-1
  safetyScore: number; // 0-1
  overallScore: number; // 0-1
  notes: string[];
}

interface BenchResult {
  promptId: string;
  category: string;
  provider: Provider;
  model: string;
  output: string;
  evalResult: EvalResult;
  latencyMs: number;
  estimatedCost: number; // USD
}

interface BenchReport {
  timestamp: string;
  models: { provider: Provider; model: string }[];
  results: BenchResult[];
  summary: {
    byModel: {
      provider: Provider;
      model: string;
      avgFormat: number;
      avgContent: number;
      avgSafety: number;
      avgOverall: number;
      avgLatencyMs: number;
      totalCost: number;
    }[];
    byCategory: {
      category: string;
      avgOverall: number;
      bestModel: string;
    }[];
  };
}

// ===== Evaluation Logic =====

function evaluate(output: string, criteria: BenchPrompt["evalCriteria"]): EvalResult {
  const notes: string[] = [];
  let formatScore = 1.0;
  let contentScore = 1.0;
  let safetyScore = 1.0;

  // — Format check —
  if (criteria.format?.includes("JSON")) {
    try {
      JSON.parse(output);
    } catch {
      formatScore -= 0.3;
      notes.push("JSON 解析失败");
    }
  }

  if (criteria.format?.includes("markdown")) {
    if (!output.includes("#") && !output.includes("##")) {
      formatScore -= 0.2;
      notes.push("缺少 Markdown 标题");
    }
  }

  // — Content check —
  if (criteria.mustInclude) {
    let missing = 0;
    for (const kw of criteria.mustInclude) {
      if (!output.includes(kw)) {
        missing++;
        notes.push(`缺少: "${kw}"`);
      }
    }
    contentScore = Math.max(0, 1 - missing * 0.15);
  }

  if (criteria.mustNotInclude) {
    for (const kw of criteria.mustNotInclude) {
      if (output.includes(kw)) {
        safetyScore -= 0.3;
        notes.push(`不应包含: "${kw}"`);
      }
    }
  }

  // — Length check —
  if (criteria.lengthRange) {
    const [min, max] = criteria.lengthRange;
    if (output.length < min) {
      contentScore -= 0.1;
      notes.push(`过短: ${output.length} < ${min}`);
    }
    if (output.length > max) {
      formatScore -= 0.1;
      notes.push(`过长: ${output.length} > ${max}`);
    }
  }

  // — Reasoning check —
  if (criteria.requiresReasoning && output.length < 100) {
    contentScore -= 0.3;
    notes.push("缺少推理过程");
  }

  // Clamp
  formatScore = Math.max(0, Math.min(1, formatScore));
  contentScore = Math.max(0, Math.min(1, contentScore));
  safetyScore = Math.max(0, Math.min(1, safetyScore));

  const overallScore = (formatScore + contentScore + safetyScore) / 3;

  return { formatScore, contentScore, safetyScore, overallScore, notes };
}

// ===== Cost Estimation (approx, per 1K tokens) =====

const PRICING: Record<Provider, { input: number; output: number }> = {
  deepseek: { input: 0.00014, output: 0.00028 },
  openai: { input: 0.00015, output: 0.0006 }, // gpt-4o-mini
  anthropic: { input: 0.0008, output: 0.004 }, // haiku
};

function estimateCost(
  provider: Provider,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING[provider];
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

// ===== Run =====

async function runBenchmark(
  bench: BenchPrompt,
  provider: Provider
): Promise<BenchResult> {
  const start = Date.now();

  const llm = createLLMClient(provider);
  const result = await llm.chat(
    [
      { role: "system", content: bench.systemPrompt },
      { role: "user", content: bench.userPrompt },
    ],
    { temperature: 0 }
  );

  const evalResult = evaluate(result.content, bench.evalCriteria);
  const inputTokens = result.usage?.inputTokens || 0;
  const outputTokens = result.usage?.outputTokens || 0;
  const cost = estimateCost(provider, inputTokens, outputTokens);

  const emoji = evalResult.overallScore >= 0.9 ? "✅" : evalResult.overallScore >= 0.7 ? "⚠️" : "❌";
  console.log(
    `  ${provider.padEnd(12)} ${emoji} ${evalResult.overallScore.toFixed(2)} ` +
      `(F:${evalResult.formatScore.toFixed(2)} C:${evalResult.contentScore.toFixed(2)} ` +
      `S:${evalResult.safetyScore.toFixed(2)}) ${result.latencyMs}ms $${cost.toFixed(4)}`
  );
  if (evalResult.notes.length > 0) {
    evalResult.notes.forEach((n) => console.log(`         ↳ ${n}`));
  }

  return {
    promptId: bench.id,
    category: bench.category,
    provider,
    model: result.model,
    output: result.content,
    evalResult,
    latencyMs: result.latencyMs,
    estimatedCost: cost,
  };
}

// ===== Report =====

function generateReport(results: BenchResult[]): BenchReport {
  const models = [
    ...new Map(
      results.map((r) => [r.provider, { provider: r.provider, model: r.model }])
    ).values(),
  ];

  // By model
  const byModelMap = new Map<
    string,
    {
      provider: Provider;
      model: string;
      formatScores: number[];
      contentScores: number[];
      safetyScores: number[];
      overallScores: number[];
      latencies: number[];
      costs: number[];
    }
  >();

  for (const r of results) {
    const key = r.provider;
    if (!byModelMap.has(key)) {
      byModelMap.set(key, {
        provider: r.provider,
        model: r.model,
        formatScores: [],
        contentScores: [],
        safetyScores: [],
        overallScores: [],
        latencies: [],
        costs: [],
      });
    }
    const entry = byModelMap.get(key)!;
    entry.formatScores.push(r.evalResult.formatScore);
    entry.contentScores.push(r.evalResult.contentScore);
    entry.safetyScores.push(r.evalResult.safetyScore);
    entry.overallScores.push(r.evalResult.overallScore);
    entry.latencies.push(r.latencyMs);
    entry.costs.push(r.estimatedCost);
  }

  const byModel = Array.from(byModelMap.values()).map((e) => ({
    provider: e.provider,
    model: e.model,
    avgFormat: avg(e.formatScores),
    avgContent: avg(e.contentScores),
    avgSafety: avg(e.safetyScores),
    avgOverall: avg(e.overallScores),
    avgLatencyMs: Math.round(avg(e.latencies)),
    totalCost: sum(e.costs),
  }));

  // By category
  const categoryMap = new Map<string, BenchResult[]>();
  for (const r of results) {
    if (!categoryMap.has(r.category)) categoryMap.set(r.category, []);
    categoryMap.get(r.category)!.push(r);
  }

  const byCategory = Array.from(categoryMap.entries()).map(([cat, catResults]) => {
    // 找此类别下最佳模型
    const modelAvg = new Map<string, number[]>();
    for (const r of catResults) {
      if (!modelAvg.has(r.provider)) modelAvg.set(r.provider, []);
      modelAvg.get(r.provider)!.push(r.evalResult.overallScore);
    }
    let bestModel = "";
    let bestScore = 0;
    for (const [m, scores] of modelAvg) {
      const s = avg(scores);
      if (s > bestScore) {
        bestScore = s;
        bestModel = m;
      }
    }

    return {
      category: cat,
      avgOverall: avg(catResults.map((r) => r.evalResult.overallScore)),
      bestModel,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    models,
    results,
    summary: { byModel, byCategory },
  };
}

function printReport(report: BenchReport): void {
  console.log("\n" + "=".repeat(70));
  console.log("  🤖 Multi-Model Benchmark Report");
  console.log("=".repeat(70));
  console.log(`  Date: ${report.timestamp}`);
  console.log(`  Models: ${report.models.map((m) => `${m.provider}(${m.model})`).join(", ")}`);

  console.log("\n─── 模型总览 " + "─".repeat(54));
  console.log(
    `  ${"模型".padEnd(14)} ${"综合".padEnd(8)} ${"格式".padEnd(8)} ${"内容".padEnd(8)} ${"安全".padEnd(8)} ${"延迟".padEnd(10)} ${"成本"}`
  );
  console.log("  " + "-".repeat(65));

  for (const m of report.summary.byModel) {
    console.log(
      `  ${m.provider.padEnd(14)} ${m.avgOverall.toFixed(2).padEnd(8)} ` +
        `${m.avgFormat.toFixed(2).padEnd(8)} ${m.avgContent.toFixed(2).padEnd(8)} ` +
        `${m.avgSafety.toFixed(2).padEnd(8)} ${(m.avgLatencyMs + "ms").padEnd(10)} ` +
        `$${m.totalCost.toFixed(4)}`
    );
  }

  console.log("\n─── 类别分析 " + "─".repeat(55));
  for (const c of report.summary.byCategory) {
    console.log(
      `  ${c.category.padEnd(14)} 平均: ${c.avgOverall.toFixed(2)}  最佳: ${c.bestModel}`
    );
  }

  // 找出总体最佳
  const best = report.summary.byModel.sort(
    (a, b) => b.avgOverall - a.avgOverall
  )[0];
  const cheapest = report.summary.byModel.sort(
    (a, b) => a.totalCost - b.totalCost
  )[0];
  const fastest = report.summary.byModel.sort(
    (a, b) => a.avgLatencyMs - b.avgLatencyMs
  )[0];

  console.log("\n─── 结论 " + "─".repeat(60));
  console.log(`  🏆 综合最佳: ${best.provider} (${best.avgOverall.toFixed(2)})`);
  console.log(`  💰 成本最低: ${cheapest.provider} ($${cheapest.totalCost.toFixed(4)})`);
  console.log(`  ⚡ 延迟最低: ${fastest.provider} (${fastest.avgLatencyMs}ms)`);

  // 性价比分析
  console.log("\n─── 性价比 " + "─".repeat(60));
  for (const m of report.summary.byModel) {
    const efficiency = m.totalCost > 0 ? (m.avgOverall / m.totalCost).toFixed(2) : "∞";
    console.log(`  ${m.provider.padEnd(14)} score/$ = ${efficiency}`);
  }

  console.log("\n" + "=".repeat(70) + "\n");
}

// ===== Helpers =====

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== CLI =====

function parseArgs(): {
  categoryFilter?: string;
  promptFilter?: string;
  modelFilter?: Provider[];
} {
  const args = process.argv.slice(2);
  const opts: {
    categoryFilter?: string;
    promptFilter?: string;
    modelFilter?: Provider[];
  } = {};

  for (const arg of args) {
    if (arg.startsWith("--category=")) {
      opts.categoryFilter = arg.split("=")[1];
    } else if (arg.startsWith("--prompt=")) {
      opts.promptFilter = arg.split("=")[1];
    } else if (arg.startsWith("--models=")) {
      opts.modelFilter = arg.split("=")[1].split(",").map((m) => m.trim()) as Provider[];
    }
  }

  return opts;
}

// ===== Main =====

async function main() {
  const opts = parseArgs();

  let prompts = BENCH_PROMPTS;
  if (opts.categoryFilter) {
    prompts = prompts.filter((p) => p.category === opts.categoryFilter);
  }
  if (opts.promptFilter) {
    prompts = prompts.filter((p) => p.id === opts.promptFilter);
  }

  const models: Provider[] = opts.modelFilter || ["deepseek", "openai", "anthropic"];

  console.log("\n🤖 Multi-Model Benchmark Runner");
  console.log(`   Prompts: ${prompts.length} (${prompts.map((p) => p.id).join(", ")})`);
  console.log(`   Models: ${models.join(", ")}\n`);

  const results: BenchResult[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const bench = prompts[i];
    console.log(`[${i + 1}/${prompts.length}] ${bench.id} (${bench.category})`);

    for (let j = 0; j < models.length; j++) {
      const model = models[j];
      await sleep(300); // rate limit protection

      const result = await runBenchmark(bench, model);
      results.push(result);
    }
    console.log();
  }

  const report = generateReport(results);
  printReport(report);
}

main().catch((err) => {
  console.error("❌ Benchmark error:", err);
  process.exit(1);
});
