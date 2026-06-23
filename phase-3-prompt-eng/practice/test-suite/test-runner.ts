/**
 * Prompt 回归测试 Runner
 *
 * 设计理念：像测试代码一样测试 Prompt——有测试用例、有断言、有报告。
 *
 * 用法：
 *   npx tsx test-runner.ts            — 运行所有测试
 *   npx tsx test-runner.ts --tags security,format  — 只运行指定标签
 *   npx tsx test-runner.ts --prompt code-reviewer   — 只测试指定 Prompt
 *   npx tsx test-runner.ts --dry-run  — 只校验用例结构，不调 API
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createLLMClient, Provider } from "../api-client/index.js";
import { TestCase, CODE_REVIEWER_CASES } from "./test-cases/code-reviewer.cases.js";
import { CODE_GENERATOR_CASES } from "./test-cases/code-generator.cases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== Types =====

interface TestResult {
  caseId: string;
  description: string;
  passed: boolean;
  /** 0-1 连续得分。规则断言是二元的 0/1，llm-rubric 给连续分数 */
  score: number;
  failures: string[];
  /**
   * 标记为 true 表示失败原因是系统错误（API 故障、网络超时）而非内容质量问题。
   * 参考 promptfoo 的 graderError 设计：逆断言遇到 graderError 不应翻转结果。
   */
  graderError?: boolean;
  latencyMs: number;
  outputPreview: string;
}

interface SuiteReport {
  timestamp: string;
  provider: string;
  model: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  totalLatencyMs: number;
  totalTokens: { input: number; output: number };
  results: TestResult[];
  failedCases: TestResult[];
}

interface SuiteConfig {
  promptId: string;
  promptPath: string;
  cases: TestCase[];
}

// ===== Prompt Loading =====

function loadPrompt(promptId: string): string {
  // 支持两种路径：prompt-vault 中的注册 prompt，或直接路径
  const vaultPath = path.resolve(
    __dirname,
    "../prompt-vault/prompts/v1/system-prompts",
    `${promptId}.md`
  );

  if (fs.existsSync(vaultPath)) {
    return fs.readFileSync(vaultPath, "utf-8");
  }

  // fallback: 尝试直接路径
  if (fs.existsSync(promptId)) {
    return fs.readFileSync(promptId, "utf-8");
  }

  throw new Error(`Prompt 文件不存在: ${promptId} (tried: ${vaultPath})`);
}

// ===== Assertions =====

interface EvaluationOutcome {
  failures: string[];
  score: number; // 0-1
}

/** 规则断言：纯本地检查，不需要额外 LLM 调用 */
function runRuleAssertions(
  output: string,
  assert: TestCase["assert"]
): EvaluationOutcome {
  const failures: string[] = [];
  let checks = 0;
  let passed = 0;

  if (assert.containsAll) {
    for (const kw of assert.containsAll) {
      checks++;
      if (output.includes(kw)) passed++;
      else failures.push(`缺少关键词: "${kw}"`);
    }
  }

  if (assert.notContains) {
    for (const kw of assert.notContains) {
      checks++;
      if (!output.includes(kw)) passed++;
      else {
        const idx = output.indexOf(kw);
        const ctx = output.slice(Math.max(0, idx - 30), idx + kw.length + 30);
        failures.push(`不应包含: "${kw}" → 上下文: ...${ctx}...`);
      }
    }
  }

  if (assert.matchRegex) {
    for (const pattern of assert.matchRegex) {
      checks++;
      const re = new RegExp(pattern, "g");
      if (re.test(output)) passed++;
      else failures.push(`不匹配正则: ${pattern}`);
    }
  }

  if (assert.maxLength !== undefined) {
    checks++;
    if (output.length <= assert.maxLength) passed++;
    else failures.push(`输出过长: ${output.length} > ${assert.maxLength} 字符`);
  }

  if (assert.minLength !== undefined) {
    checks++;
    if (output.length >= assert.minLength) passed++;
    else failures.push(`输出过短: ${output.length} < ${assert.minLength} 字符`);
  }

  // 规则断言是二元的：全部通过 = 1.0，否则 = 通过比例
  const score = checks === 0 ? 1 : passed / checks;
  return { failures, score };
}

/**
 * LLM-as-Judge：用另一个模型根据 rubric 评分。
 * 完全参考 promptfoo 的 matchesLlmRubric() 设计——system role 定规则，
 * user role 用 XML 标签分隔数据和标准。
 */
async function gradeWithLlmRubric(
  output: string,
  rubric: string,
  judgeProvider?: Provider
): Promise<{ score: number; reason: string }> {
  const judge = createLLMClient(judgeProvider);

  const gradingPrompt = [
    {
      role: "system" as const,
      content:
        `You are grading output according to a user-specified rubric. ` +
        `If the statement in the rubric is true, then the output passes the test. ` +
        `You respond with a JSON object with this structure: {reason: string, pass: boolean, score: number}\n\n` +
        `Examples:\n` +
        `<Output>Hello world</Output>\n` +
        `<Rubric>Content contains a greeting</Rubric>\n` +
        `{"reason": "the content contains the word 'Hello'", "pass": true, "score": 1.0}\n\n` +
        `<Output>Avast ye swabs, repel the invaders!</Output>\n` +
        `<Rubric>Does not speak like a pirate</Rubric>\n` +
        `{"reason": "'avast ye' is a common pirate term", "pass": false, "score": 0.0}`,
    },
    {
      role: "user" as const,
      content: `<Output>\n${output}\n</Output>\n<Rubric>\n${rubric}\n</Rubric>`,
    },
  ];

  const res = await judge.chat(gradingPrompt);

  try {
    // 提取 JSON（可能被包裹在 markdown 代码块中）
    const jsonMatch = res.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in judge response");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: typeof parsed.score === "number" ? parsed.score : parsed.pass ? 1 : 0,
      reason: parsed.reason || JSON.stringify(parsed),
    };
  } catch {
    // 解析失败 = graderError，裁判系统出错
    return { score: 0, reason: `Judge parse error: ${res.content.slice(0, 200)}` };
  }
}

/** 组合评估：先跑规则断言，再跑 llmRubric（如果有） */
async function evaluateOutput(
  output: string,
  assert: TestCase["assert"]
): Promise<EvaluationOutcome> {
  const ruleResult = runRuleAssertions(output, assert);

  if (!assert.llmRubric) {
    return ruleResult;
  }

  // 有 llmRubric：额外调 LLM 裁判
  try {
    const rubricResult = await gradeWithLlmRubric(
      output,
      assert.llmRubric.rubric
    );

    // 合并：规则断言权重 + llmRubric 权重，各占 50%
    const combinedScore = (ruleResult.score + rubricResult.score) / 2;
    const threshold = assert.llmRubric.threshold ?? 0.7;
    const rubricPassed = rubricResult.score >= threshold;

    const failures = [...ruleResult.failures];
    if (!rubricPassed) {
      failures.push(
        `llmRubric: score ${rubricResult.score.toFixed(2)} < threshold ${threshold}. ` +
          `Reason: ${rubricResult.reason}`
      );
    }

    return { failures, score: combinedScore };
  } catch (err: any) {
    // llmRubric 调用失败 = graderError
    return {
      failures: [...ruleResult.failures, `llmRubric graderError: ${err.message}`],
      score: ruleResult.score,
    };
  }
}

// ===== Test Execution =====

async function runTest(
  testCase: TestCase,
  systemPrompt: string,
  index: number,
  total: number
): Promise<TestResult> {
  const start = Date.now();

  try {
    const llm = createLLMClient();
    const result = await llm.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: testCase.input },
    ]);

    const evaluation = await evaluateOutput(result.content, testCase.assert);
    const passed = evaluation.failures.length === 0;

    if (passed) {
      console.log(
        `  [${index}/${total}] ✅ ${testCase.id}: ${testCase.description} (score: ${evaluation.score.toFixed(2)})`
      );
    } else {
      console.log(
        `  [${index}/${total}] ❌ ${testCase.id}: ${testCase.description} (score: ${evaluation.score.toFixed(2)})`
      );
      evaluation.failures.forEach((f) => console.log(`         ↳ ${f}`));
    }

    return {
      caseId: testCase.id,
      description: testCase.description,
      passed,
      score: evaluation.score,
      failures: evaluation.failures,
      latencyMs: result.latencyMs,
      outputPreview: result.content.slice(0, 150),
    };
  } catch (err: any) {
    console.log(`  [${index}/${total}] 💥 ${testCase.id}: ${err.message}`);
    return {
      caseId: testCase.id,
      description: testCase.description,
      passed: false,
      score: 0,
      failures: [`API 错误: ${err.message}`],
      graderError: true, // ← promptfoo 风格的 graderError 标记
      latencyMs: Date.now() - start,
      outputPreview: "",
    };
  }
}

async function runSuite(config: SuiteConfig): Promise<SuiteReport> {
  const systemPrompt = loadPrompt(config.promptId);
  const cases = config.cases;
  const total = cases.length;

  console.log(`\n🧪 测试 Prompt: ${config.promptId}`);
  console.log(`   路径: ${config.promptPath}`);
  console.log(`   用例数: ${total}\n`);

  const results: TestResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalLatencyMs = 0;

  for (let i = 0; i < cases.length; i++) {
    // 避免并发太快触发 rate limit
    if (i > 0) await sleep(500);
    const result = await runTest(cases[i], systemPrompt, i + 1, total);
    results.push(result);
    totalLatencyMs += result.latencyMs;
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const failedCases = results.filter((r) => !r.passed);

  return {
    timestamp: new Date().toISOString(),
    provider: createLLMClient().provider,
    model: createLLMClient().model,
    total,
    passed,
    failed,
    skipped: 0,
    totalLatencyMs,
    totalTokens: { input: totalInputTokens, output: totalOutputTokens },
    results,
    failedCases,
  };
}

// ===== Report =====

function printReport(reports: SuiteReport[]): void {
  const all = reports.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      passed: acc.passed + r.passed,
      failed: acc.failed + r.failed,
      latencyMs: acc.latencyMs + r.totalLatencyMs,
    }),
    { total: 0, passed: 0, failed: 0, latencyMs: 0 }
  );

  console.log("\n" + "=".repeat(60));
  console.log("  Prompt Test Report");
  console.log("=".repeat(60));
  console.log(`  Date:     ${reports[0]?.timestamp || "N/A"}`);
  console.log(`  Provider: ${reports[0]?.provider || "N/A"} (${reports[0]?.model || "N/A"})`);
  console.log(`  Total:    ${all.total} cases`);
  console.log(`  Passed:   ${all.passed} (${((all.passed / all.total) * 100).toFixed(1)}%)`);
  console.log(`  Failed:   ${all.failed} (${((all.failed / all.total) * 100).toFixed(1)}%)`);
  console.log(`  Latency:  ${(all.latencyMs / 1000).toFixed(1)}s`);
  console.log("-".repeat(60));

  if (all.failed > 0) {
    console.log("\n  Failed Cases:");
    for (const report of reports) {
      for (const r of report.failedCases) {
        console.log(`\n  ❌ ${r.caseId}: ${r.description}`);
        r.failures.forEach((f) => console.log(`     ↳ ${f}`));
        if (r.outputPreview) {
          console.log(`     Output: ${r.outputPreview}...`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

// ===== CLI =====

function parseArgs(): {
  promptFilter?: string;
  tagFilter?: string[];
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  const opts: { promptFilter?: string; tagFilter?: string[]; dryRun: boolean } =
    { dryRun: false };

  for (const arg of args) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg.startsWith("--prompt=")) {
      opts.promptFilter = arg.split("=")[1];
    } else if (arg.startsWith("--tags=")) {
      opts.tagFilter = arg.split("=")[1].split(",").map((t) => t.trim());
    }
  }

  return opts;
}

function getSuites(opts: ReturnType<typeof parseArgs>): SuiteConfig[] {
  const allSuites: SuiteConfig[] = [
    {
      promptId: "code-reviewer",
      promptPath: "prompts/v1/system-prompts/code-reviewer.md",
      cases: CODE_REVIEWER_CASES,
    },
    {
      promptId: "code-generator",
      promptPath: "prompts/v1/system-prompts/code-generator.md",
      cases: CODE_GENERATOR_CASES,
    },
  ];

  let suites = allSuites;

  if (opts.promptFilter) {
    suites = suites.filter((s) => s.promptId === opts.promptFilter);
    if (suites.length === 0) {
      console.error(`❌ 未找到 Prompt: ${opts.promptFilter}`);
      process.exit(1);
    }
  }

  if (opts.tagFilter) {
    suites = suites.map((s) => ({
      ...s,
      cases: s.cases.filter((c) =>
        c.tags.some((t) => opts.tagFilter!.includes(t))
      ),
    }));
  }

  return suites;
}

// ===== Dry Run =====

function dryRun(suites: SuiteConfig[]): void {
  console.log("\n🔍 Dry Run — 仅校验用例结构\n");

  let total = 0;
  let valid = 0;

  for (const suite of suites) {
    console.log(`  ${suite.promptId} (${suite.cases.length} cases):`);

    for (const c of suite.cases) {
      total++;
      const errors: string[] = [];

      if (!c.id) errors.push("缺少 id");
      if (!c.description) errors.push("缺少 description");
      if (!c.input) errors.push("缺少 input");
      if (!c.assert) errors.push("缺少 assert");
      if (!c.tags?.length) errors.push("缺少 tags");
      if (c.assert && Object.keys(c.assert).length === 0) {
        errors.push("assert 为空");
      }

      if (errors.length === 0) {
        valid++;
        console.log(`    ✅ ${c.id}`);
      } else {
        console.log(`    ❌ ${c.id}: ${errors.join(", ")}`);
      }
    }
  }

  console.log(`\n  总计: ${valid}/${total} 有效用例\n`);
}

// ===== Main =====

async function main() {
  const opts = parseArgs();
  const suites = getSuites(opts);

  const totalCases = suites.reduce((s, suite) => s + suite.cases.length, 0);
  console.log(`\n🚀 Prompt Test Runner`);
  const llm = createLLMClient();
  console.log(`   Provider: ${llm.provider} (${llm.model})`);
  console.log(`   Suites: ${suites.map((s) => s.promptId).join(", ")}`);
  console.log(`   Cases: ${totalCases}`);

  if (opts.dryRun) {
    dryRun(suites);
    return;
  }

  const reports: SuiteReport[] = [];
  for (const suite of suites) {
    const report = await runSuite(suite);
    reports.push(report);
  }

  printReport(reports);

  // 以 exit code 反映测试结果
  const hasFailed = reports.some((r) => r.failed > 0);
  process.exit(hasFailed ? 1 : 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("❌ Test runner error:", err);
  process.exit(1);
});
