/**
 * Prompt Vault — Prompt 版本化管理 CLI
 *
 * 设计理念：把 Prompt 当 npm 包管理——有版本号、有 changelog、可 diff。
 *
 * 命令：
 *   npx tsx prompt-registry.ts list              — 列出所有 Prompt
 *   npx tsx prompt-registry.ts show <id>         — 查看详情
 *   npx tsx prompt-registry.ts diff <id> <v1> <v2> — 对比版本
 *   npx tsx prompt-registry.ts validate <id>     — 校验完整性
 *   npx tsx prompt-registry.ts validate <id> --smoke — 校验 + LLM smoke test
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ===== Types =====

interface PromptMeta {
  id: string; // 唯一标识，如 "code-reviewer"
  name: string; // 人类可读名称
  description: string;
  versions: PromptVersion[];
}

interface PromptVersion {
  version: string; // semver
  date: string;
  author: string;
  path: string; // 相对于 vault root 的路径
  tags: string[];
  changelog?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ===== Template Engine (轻量 f-string 实现，参考 LangChain) =====

/**
 * 从 prompt 内容中提取所有 {变量名}。
 * 不支持 {{ 转义（当前 prompt 不需要），后续可扩展。
 */
function extractVariables(content: string): string[] {
  const re = /\{(\w+)\}/g;
  const vars = new Set<string>();
  let match;
  while ((match = re.exec(content)) !== null) {
    vars.add(match[1]);
  }
  return [...vars];
}

/**
 * 用 dummy 值渲染模板——如果变量名拼错、括号不闭合，
 * 这里就会报错（LangChain checkValidTemplate 的核心理念）。
 *
 * 返回值：{ rendered: string; replaced: Record<string, string> }
 */
function renderWithDummyValues(content: string): {
  rendered: string;
  replaced: Record<string, string>;
} {
  const vars = extractVariables(content);
  const replaced: Record<string, string> = {};

  let result = content;
  for (const v of vars) {
    replaced[v] = `<test_${v}>`;
    result = result.replace(new RegExp(`\\{${v}\\}`, "g"), replaced[v]);
  }

  // 检查未闭合的括号（奇数个 { 或 }）
  const openCount = (result.match(/\{/g) || []).length;
  const closeCount = (result.match(/\}/g) || []).length;
  if (openCount !== closeCount) {
    throw new Error(
      `括号不匹配: ${openCount} 个 "{" vs ${closeCount} 个 "}"`
    );
  }

  return { rendered: result, replaced };
}

// ===== Registry =====

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VAULT_ROOT = path.resolve(__dirname, "prompts");

/**
 * Prompt 注册表——记录了 vault 中所有 prompt 的元数据。
 * 每次新增 Prompt 或新版本，在这里注册。
 */
const REGISTRY: PromptMeta[] = [
  {
    id: "code-reviewer",
    name: "代码审查专家",
    description: "TypeScript + React 代码审查，安全/性能/可维护性",
    versions: [
      {
        version: "1.0.0",
        date: "2026-06-23",
        author: "Chance",
        path: "v1/system-prompts/code-reviewer.md",
        tags: ["code-review", "typescript", "react"],
        changelog: "初始版本：定义角色、约束、行为规则、推理协议",
      },
    ],
  },
  {
    id: "code-generator",
    name: "代码生成专家",
    description: "TypeScript + React 代码生成，简洁类型安全可测试",
    versions: [
      {
        version: "1.0.0",
        date: "2026-06-23",
        author: "Chance",
        path: "v1/system-prompts/code-generator.md",
        tags: ["code-generation", "typescript", "react"],
        changelog: "初始版本：定义输出格式、行为规则、代码规范",
      },
    ],
  },
];

// ===== Commands =====

function cmdList(): void {
  console.log("\n📦 Prompt Vault — 注册表\n");
  console.log(`Vault 路径: ${VAULT_ROOT}\n`);

  for (const meta of REGISTRY) {
    const latest = meta.versions[meta.versions.length - 1];
    console.log(`  ${meta.id}`);
    console.log(`    名称: ${meta.name}`);
    console.log(`    描述: ${meta.description}`);
    console.log(
      `    版本数: ${meta.versions.length} (latest: v${latest.version})`
    );
    console.log(`    Tags: ${latest.tags.join(", ")}`);
    console.log();
  }
}

function cmdShow(id: string): void {
  const meta = REGISTRY.find((m) => m.id === id);
  if (!meta) {
    console.error(`❌ 未找到 Prompt: ${id}`);
    process.exit(1);
  }

  const latest = meta.versions[meta.versions.length - 1];
  const fullPath = path.join(VAULT_ROOT, latest.path);

  console.log(`\n📄 ${meta.name} (${meta.id})`);
  console.log(`   版本: v${latest.version}`);
  console.log(`   日期: ${latest.date}`);
  console.log(`   作者: ${latest.author}`);
  console.log(`   文件: ${latest.path}`);
  if (latest.changelog) console.log(`   Changelog: ${latest.changelog}`);
  console.log(`\n─── 文件内容 ───\n`);

  if (fs.existsSync(fullPath)) {
    console.log(fs.readFileSync(fullPath, "utf-8"));
  } else {
    console.error(`❌ 文件不存在: ${fullPath}`);
  }
}

function cmdDiff(id: string, v1: string, v2: string): void {
  const meta = REGISTRY.find((m) => m.id === id);
  if (!meta) {
    console.error(`❌ 未找到 Prompt: ${id}`);
    process.exit(1);
  }

  const ver1 = meta.versions.find((v) => v.version === v1);
  const ver2 = meta.versions.find((v) => v.version === v2);

  if (!ver1 || !ver2) {
    console.error(`❌ 版本不存在: ${!ver1 ? v1 : v2}`);
    process.exit(1);
  }

  const path1 = path.join(VAULT_ROOT, ver1.path);
  const path2 = path.join(VAULT_ROOT, ver2.path);

  if (!fs.existsSync(path1) || !fs.existsSync(path2)) {
    console.error("❌ 文件不存在");
    process.exit(1);
  }

  const content1 = fs.readFileSync(path1, "utf-8");
  const content2 = fs.readFileSync(path2, "utf-8");

  console.log(`\n📊 Diff: ${id} v${v1} → v${v2}\n`);

  // 简单的行级 diff
  const lines1 = content1.split("\n");
  const lines2 = content2.split("\n");
  const maxLen = Math.max(lines1.length, lines2.length);

  let additions = 0;
  let deletions = 0;
  let changes = 0;

  for (let i = 0; i < maxLen; i++) {
    const l1 = lines1[i] ?? "(EOF)";
    const l2 = lines2[i] ?? "(EOF)";
    if (l1 !== l2) {
      if (lines1[i] === undefined) {
        console.log(`  + ${l2}`);
        additions++;
      } else if (lines2[i] === undefined) {
        console.log(`  - ${l1}`);
        deletions++;
      } else {
        console.log(`  - ${l1}`);
        console.log(`  + ${l2}`);
        changes++;
      }
    }
  }

  console.log(
    `\n  统计: +${additions} additions, -${deletions} deletions, ~${changes} changes`
  );
}

async function cmdValidate(id: string, smoke: boolean): Promise<void> {
  const meta = REGISTRY.find((m) => m.id === id);
  if (!meta) {
    console.error(`❌ 未找到 Prompt: ${id}`);
    process.exit(1);
  }

  const latest = meta.versions[meta.versions.length - 1];
  const fullPath = path.join(VAULT_ROOT, latest.path);

  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  // ===== Layer 1: 文件存在性 =====
  if (!fs.existsSync(fullPath)) {
    result.errors.push(`文件不存在: ${fullPath}`);
    result.valid = false;
    printValidation(result, id);
    return;
  }

  const content = fs.readFileSync(fullPath, "utf-8");

  // ===== Layer 2: 模板变量提取 + dummy 渲染 (LangChain checkValidTemplate 风格) =====
  const variables = extractVariables(content);
  if (variables.length > 0) {
    try {
      const { rendered } = renderWithDummyValues(content);
      result.warnings.push(
        `检测到 ${variables.length} 个模板变量: ${variables.join(", ")}（dummy 渲染通过）`
      );
    } catch (e: any) {
      result.errors.push(`模板渲染失败: ${e.message}`);
      result.valid = false;
    }
  } else {
    result.warnings.push("未检测到模板变量（纯静态 Prompt）");
  }

  // ===== Layer 3: 结构检查 =====
  if (!content.includes("## Role") && !content.includes("## 角色")) {
    result.errors.push('缺少 「## Role」段落（定义 Agent 角色）');
    result.valid = false;
  }

  if (!content.includes("## Constraints") && !content.includes("## 约束")) {
    result.errors.push('缺少 「## Constraints」段落（定义约束规则）');
    result.valid = false;
  }

  if (!content.includes("version:")) {
    result.warnings.push("建议在 Prompt 头部声明 version 元数据");
  }

  // 约束冲突启发式检查
  if (
    content.includes("始终") &&
    content.includes("不要") &&
    (content.match(/始终/g) || []).length > 3
  ) {
    result.warnings.push(
      "有多条「始终」约束，建议不超过 3 条（过多约束会降低模型灵活性）"
    );
  }

  // ===== Layer 4: Token 估算 =====
  const estimatedTokens = Math.round(
    content.length * 0.4 + content.split(/\s+/).length * 0.3
  );
  if (estimatedTokens > 2000) {
    result.warnings.push(
      `System Prompt 估算约 ${estimatedTokens} tokens，建议压缩到 1000 tokens 以内`
    );
  }
  result.warnings.push(`估算 System Prompt token 数: ~${estimatedTokens}`);

  // ===== Layer 5: Smoke Test（可选，调 LLM 验证） =====
  if (smoke) {
    console.log("\n🔥 Smoke Test — 发送最小请求验证 Prompt 不导致异常...\n");

    try {
      const { createLLMClient } = await import("../api-client/index.js");
      const llm = createLLMClient();
      const smokeInput = "Hello.";

      const res = await llm.chat([
        { role: "system", content },
        { role: "user", content: smokeInput },
      ]);

      if (res.content && res.content.length > 0) {
        console.log(`  ✅ 模型正常响应 (${res.latencyMs}ms)`);
        console.log(`  📝 响应预览: ${res.content.slice(0, 120)}...`);
        result.warnings.push(`Smoke test 通过: ${res.latencyMs}ms, ${res.model}`);
      } else {
        result.errors.push("Smoke test 失败: 模型返回空响应");
        result.valid = false;
      }
    } catch (e: any) {
      result.errors.push(`Smoke test 失败: ${e.message}`);
      result.valid = false;
    }
  }

  printValidation(result, id);
}

function printValidation(result: ValidationResult, id: string): void {
  console.log(`\n🔍 校验: ${id}\n`);

  if (result.errors.length > 0) {
    console.log("❌ 错误:");
    result.errors.forEach((e) => console.log(`   - ${e}`));
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log("⚠️  警告:");
    result.warnings.forEach((w) => console.log(`   - ${w}`));
    console.log();
  }

  if (result.valid) {
    console.log("✅ 校验通过\n");
  } else {
    console.log("❌ 校验失败，请修复以上错误\n");
  }
}

// ===== CLI Entry =====

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "list":
    cmdList();
    break;
  case "show":
    if (!args[1]) {
      console.error("用法: prompt-registry.ts show <prompt-id>");
      process.exit(1);
    }
    cmdShow(args[1]);
    break;
  case "diff":
    if (!args[1] || !args[2] || !args[3]) {
      console.error("用法: prompt-registry.ts diff <prompt-id> <v1> <v2>");
      process.exit(1);
    }
    cmdDiff(args[1], args[2], args[3]);
    break;
  case "validate": {
    if (!args[1]) {
      console.error("用法: prompt-registry.ts validate <prompt-id> [--smoke]");
      process.exit(1);
    }
    const smoke = args.includes("--smoke");
    await cmdValidate(args[1], smoke);
    break;
  }
  default:
    console.log(`
📦 Prompt Vault CLI

用法: npx tsx prompt-registry.ts <command> [args]

命令:
  list                          列出所有 Prompt
  show <id>                     查看 Prompt 详情和内容
  diff <id> <v1> <v2>          对比两个版本
  validate <id>                 校验 Prompt 结构完整性
    `);
}
