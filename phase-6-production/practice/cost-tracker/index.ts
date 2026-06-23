/**
 * 成本追踪器：Token 计价 + 预算层级 + 漂移检测 + 成本产出分析
 *
 * 设计理念（对应 theory/01-cost-governance.md §1-5）：
 *   成本治理的核心转变是从 cost-per-token 到 cost-per-outcome。
 *   只知道"每个 token 多少钱"不够——要知道"完成一个任务花了多少钱"。
 *   PricingEngine 把 token 转译成美元，BudgetManager 把你控制在预算内，
 *   DriftDetector 在成本悄悄上涨时告警，CostOutcomeTracker 告诉你 ROI。
 *
 * 运行：npm run cost-tracker
 */

// ============================================================
// Types
// ============================================================

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheWriteTokens: number;
}

interface PricingTier {
  modelName: string;
  provider: "openai" | "anthropic" | "deepseek";
  promptPricePer1K: number;
  completionPricePer1K: number;
  cacheReadPricePer1K?: number;
  cacheWritePricePer1K?: number;
}

interface BudgetAlert {
  timestamp: number;
  type: "SOFT_LIMIT" | "HARD_LIMIT" | "DRIFT";
  level?: string;
  message: string;
}

interface BudgetNode {
  id: string;
  level: "org" | "team" | "user" | "key" | "tag";
  name: string;
  monthlyLimit: number;
  softLimit: number;
  currentSpend: number;
  children: BudgetNode[];
  alerts: BudgetAlert[];
}

interface DriftReport {
  baseline: { avgCostPerCall: number; stdDev: number };
  current: { avgCostPerCall: number; stdDev: number };
  driftPercent: number;
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  suggestions: string[];
}

interface CallRecord {
  model: string;
  cost: number;
  timestamp: number;
}

interface OutcomeRecord {
  type: string;
  success: boolean;
  cost: number;
}

interface SessionOutcome {
  sessionId: string;
  calls: { cost: number; model: string }[];
  outcomes: OutcomeRecord[];
}

interface CostPerOutcome {
  totalSessionCost: number;
  successfulOutcomes: number;
  costPerSuccess: number;
  byType: Record<string, { count: number; cost: number; costPerUnit: number }>;
}

// ============================================================
// PRICING TABLE (2025-2026 参考价格)
// ============================================================

const PRICING: PricingTier[] = [
  { modelName: "gpt-4o", provider: "openai", promptPricePer1K: 0.0025, completionPricePer1K: 0.010 },
  { modelName: "gpt-4o-mini", provider: "openai", promptPricePer1K: 0.00015, completionPricePer1K: 0.0006 },
  { modelName: "claude-3.5-sonnet", provider: "anthropic", promptPricePer1K: 0.003, completionPricePer1K: 0.015, cacheReadPricePer1K: 0.0003, cacheWritePricePer1K: 0.00375 },
  { modelName: "claude-3.5-haiku", provider: "anthropic", promptPricePer1K: 0.0008, completionPricePer1K: 0.004, cacheReadPricePer1K: 0.00008, cacheWritePricePer1K: 0.001 },
  { modelName: "deepseek-v3", provider: "deepseek", promptPricePer1K: 0.00027, completionPricePer1K: 0.0011 },
];

// ============================================================
// 1. PricingEngine — Token → USD
// ============================================================

class PricingEngine {
  private tiers: Map<string, PricingTier>;

  constructor(tiers: PricingTier[] = PRICING) {
    this.tiers = new Map(tiers.map(t => [t.modelName, t]));
  }

  calculateCost(usage: TokenUsage, modelName: string): number {
    const tier = this.tiers.get(modelName);
    if (!tier) throw new Error(`未知模型: ${modelName}`);

    let cost = 0;

    // Prompt tokens（区分 cache hit）
    const uncachedPrompt = Math.max(0, usage.promptTokens - usage.cacheHitTokens);
    cost += (uncachedPrompt / 1000) * tier.promptPricePer1K;

    // Cache hit tokens（读 — 约 1/10 价格）
    if (usage.cacheHitTokens > 0 && tier.cacheReadPricePer1K) {
      cost += (usage.cacheHitTokens / 1000) * tier.cacheReadPricePer1K;
    }

    // Cache write tokens（写 — 按原价或稍高）
    if (usage.cacheWriteTokens > 0) {
      const writePrice = tier.cacheWritePricePer1K ?? tier.promptPricePer1K;
      cost += (usage.cacheWriteTokens / 1000) * writePrice;
    }

    // Completion tokens
    cost += (usage.completionTokens / 1000) * tier.completionPricePer1K;

    return cost;
  }

  estimateCost(promptTokens: number, completionTokens: number, modelName: string): number {
    return this.calculateCost({ promptTokens, completionTokens, cacheHitTokens: 0, cacheWriteTokens: 0 }, modelName);
  }

  getTier(modelName: string): PricingTier | undefined {
    return this.tiers.get(modelName);
  }

  getAllModels(): string[] {
    return [...this.tiers.keys()];
  }
}

// ============================================================
// 2. BudgetManager — 五级预算树
// ============================================================

class BudgetManager {
  private root: BudgetNode;
  private nodeMap: Map<string, BudgetNode> = new Map();

  constructor(root: BudgetNode) {
    this.root = root;
    this.indexNodes(root);
  }

  private indexNodes(node: BudgetNode): void {
    this.nodeMap.set(node.id, node);
    for (const child of node.children) this.indexNodes(child);
  }

  checkBudget(nodeId: string, estimatedCost: number): BudgetAlert | null {
    const node = this.nodeMap.get(nodeId);
    if (!node) throw new Error(`未找到预算节点: ${nodeId}`);

    const ancestors = this.getAncestors(nodeId);

    for (const n of ancestors) {
      const projected = n.currentSpend + estimatedCost;
      if (projected > n.monthlyLimit) {
        const alert: BudgetAlert = {
          timestamp: Date.now(),
          type: "HARD_LIMIT",
          level: n.level,
          message: `🚨 ${n.name} (${n.level}): 预算耗尽可能！当前 $${n.currentSpend.toFixed(2)} + 预估 $${estimatedCost.toFixed(4)} = $${projected.toFixed(2)} > 上限 $${n.monthlyLimit.toFixed(2)}`,
        };
        return alert;
      }
      if (projected > n.softLimit) {
        const alert: BudgetAlert = {
          timestamp: Date.now(),
          type: "SOFT_LIMIT",
          level: n.level,
          message: `⚠️  ${n.name} (${n.level}): 已达软限制（${((projected / n.monthlyLimit) * 100).toFixed(1)}%），当前 $${n.currentSpend.toFixed(2)} / $${n.monthlyLimit.toFixed(2)}`,
        };
        return alert;
      }
    }

    return null; // OK
  }

  spend(nodeId: string, cost: number): BudgetAlert[] {
    const alerts: BudgetAlert[] = [];
    const ancestors = this.getAncestors(nodeId);

    for (const n of ancestors) {
      n.currentSpend += cost;
      if (n.currentSpend > n.softLimit && n.currentSpend - cost <= n.softLimit) {
        const alert: BudgetAlert = {
          timestamp: Date.now(),
          type: "SOFT_LIMIT",
          level: n.level,
          message: `⚠️  ${n.name}: 触达软限制 $${n.softLimit.toFixed(2)} (${((n.currentSpend / n.monthlyLimit) * 100).toFixed(1)}%)`,
        };
        n.alerts.push(alert);
        alerts.push(alert);
      }
      if (n.currentSpend > n.monthlyLimit && n.currentSpend - cost <= n.monthlyLimit) {
        const alert: BudgetAlert = {
          timestamp: Date.now(),
          type: "HARD_LIMIT",
          level: n.level,
          message: `🚨 ${n.name}: 超出预算上限 $${n.monthlyLimit.toFixed(2)}! 当前 $${n.currentSpend.toFixed(2)}`,
        };
        n.alerts.push(alert);
        alerts.push(alert);
      }
    }

    return alerts;
  }

  getBudgetStatus(): { node: BudgetNode; usagePercent: number; status: "OK" | "WARNING" | "EXCEEDED" }[] {
    const result: { node: BudgetNode; usagePercent: number; status: "OK" | "WARNING" | "EXCEEDED" }[] = [];

    const traverse = (node: BudgetNode) => {
      const pct = (node.currentSpend / node.monthlyLimit) * 100;
      result.push({
        node,
        usagePercent: pct,
        status: pct >= 100 ? "EXCEEDED" : pct >= 80 ? "WARNING" : "OK",
      });
      for (const child of node.children) traverse(child);
    };

    traverse(this.root);
    return result;
  }

  private findNode(id: string): BudgetNode {
    const node = this.nodeMap.get(id);
    if (!node) throw new Error(`未找到预算节点: ${id}`);
    return node;
  }

  private getAncestors(nodeId: string): BudgetNode[] {
    // Walk up from node to root
    const ancestors: BudgetNode[] = [];
    const findPath = (node: BudgetNode, target: string, path: BudgetNode[]): boolean => {
      path.push(node);
      if (node.id === target) return true;
      for (const child of node.children) {
        if (findPath(child, target, path)) return true;
      }
      path.pop();
      return false;
    };
    findPath(this.root, nodeId, ancestors);
    return ancestors;
  }
}

// ============================================================
// 3. DriftDetector — 成本漂移检测
// ============================================================

class DriftDetector {
  private records: CallRecord[] = [];
  private readonly WINDOW_SIZE = 30;

  recordCall(model: string, cost: number): void {
    this.records.push({ model, cost, timestamp: Date.now() });
    // 保持窗口大小
    if (this.records.length > this.WINDOW_SIZE * 2) {
      this.records = this.records.slice(-this.WINDOW_SIZE * 2);
    }
  }

  calculateDrift(model?: string): DriftReport {
    let filtered = model
      ? this.records.filter(r => r.model === model)
      : [...this.records];

    if (filtered.length < 10) {
      return {
        baseline: { avgCostPerCall: 0, stdDev: 0 },
        current: { avgCostPerCall: 0, stdDev: 0 },
        driftPercent: 0,
        severity: "NONE",
        suggestions: ["数据量不足（需 ≥ 10 条记录）"],
      };
    }

    const midPoint = Math.floor(filtered.length / 2);
    const baselineRecords = filtered.slice(0, midPoint);
    const currentRecords = filtered.slice(midPoint);

    const baselineAvg = this.avg(baselineRecords.map(r => r.cost));
    const baselineStd = this.stdDev(baselineRecords.map(r => r.cost));
    const currentAvg = this.avg(currentRecords.map(r => r.cost));
    const currentStd = this.stdDev(currentRecords.map(r => r.cost));

    const driftPercent = baselineAvg > 0 ? ((currentAvg - baselineAvg) / baselineAvg) * 100 : 0;

    let severity: DriftReport["severity"];
    let suggestions: string[] = [];

    if (Math.abs(driftPercent) > 50) {
      severity = "HIGH";
      suggestions = ["立即检查模型版本是否升级", "审查最近的 Prompt 变更", "排查是否出现重试循环"];
    } else if (Math.abs(driftPercent) > 30) {
      severity = "MEDIUM";
      suggestions = ["检查 Prompt 长度是否膨胀", "确认是否切换到更贵的模型", "审查 cache hit rate 是否下降"];
    } else if (Math.abs(driftPercent) > 10) {
      severity = "LOW";
      suggestions = ["持续监控趋势", "检查是否有新的高成本 use case 上线"];
    } else {
      severity = "NONE";
      suggestions = ["成本正常，无需操作"];
    }

    return {
      baseline: { avgCostPerCall: baselineAvg, stdDev: baselineStd },
      current: { avgCostPerCall: currentAvg, stdDev: currentStd },
      driftPercent,
      severity,
      suggestions,
    };
  }

  private avg(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    const m = this.avg(values);
    return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
  }
}

// ============================================================
// 4. CostOutcomeTracker — 成本产出追踪
// ============================================================

class CostOutcomeTracker {
  private sessions = new Map<string, SessionOutcome>();

  startSession(sessionId: string): void {
    this.sessions.set(sessionId, { sessionId, calls: [], outcomes: [] });
  }

  recordCall(sessionId: string, cost: number, model: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`未找到会话: ${sessionId}`);
    session.calls.push({ cost, model });
  }

  recordOutcome(sessionId: string, type: string, success: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`未找到会话: ${sessionId}`);
    const totalCost = session.calls.reduce((s, c) => s + c.cost, 0);
    session.outcomes.push({ type, success, cost: totalCost });
  }

  getCostPerOutcome(sessionId: string): CostPerOutcome {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`未找到会话: ${sessionId}`);

    const totalCost = session.calls.reduce((s, c) => s + c.cost, 0);
    const successes = session.outcomes.filter(o => o.success);

    const byType: Record<string, { count: number; cost: number; costPerUnit: number }> = {};
    for (const o of session.outcomes) {
      if (!byType[o.type]) byType[o.type] = { count: 0, cost: 0, costPerUnit: 0 };
      byType[o.type].count++;
      byType[o.type].cost += totalCost / session.outcomes.length; // 均摊成本
    }
    for (const key of Object.keys(byType)) {
      byType[key].costPerUnit = byType[key].count > 0 ? byType[key].cost / byType[key].count : 0;
    }

    return {
      totalSessionCost: totalCost,
      successfulOutcomes: successes.length,
      costPerSuccess: successes.length > 0 ? totalCost / successes.length : Infinity,
      byType,
    };
  }
}

// ============================================================
// Demo
// ============================================================

async function main() {
  console.log("\n💰 成本追踪器 Demo\n");
  console.log("=".repeat(65));

  // --- Phase 1: 价格计算 ---
  console.log("\n📦 Phase 1: Token → USD 价格计算");
  console.log("-".repeat(45));

  const pricing = new PricingEngine();

  // 模拟一个多 Agent 任务
  const agents = [
    { name: "Orchestrator", usage: { promptTokens: 8000, completionTokens: 3000, cacheHitTokens: 0, cacheWriteTokens: 0 }, model: "gpt-4o" },
    { name: "Code Generator", usage: { promptTokens: 35000, completionTokens: 8000, cacheHitTokens: 0, cacheWriteTokens: 0 }, model: "claude-3.5-sonnet" },
    { name: "Code Reviewer", usage: { promptTokens: 22000, completionTokens: 5000, cacheHitTokens: 0, cacheWriteTokens: 0 }, model: "claude-3.5-sonnet" },
    { name: "Test Writer", usage: { promptTokens: 18000, completionTokens: 6000, cacheHitTokens: 0, cacheWriteTokens: 0 }, model: "gpt-4o" },
    { name: "Synthesizer", usage: { promptTokens: 5000, completionTokens: 2000, cacheHitTokens: 0, cacheWriteTokens: 0 }, model: "deepseek-v3" },
  ];

  let totalCost = 0;
  console.log("");
  for (const agent of agents) {
    const cost = pricing.calculateCost(agent.usage, agent.model);
    totalCost += cost;
    const tokens = agent.usage.promptTokens + agent.usage.completionTokens;
    console.log(`  ${agent.name.padEnd(16)} | ${agent.model.padEnd(18)} | ${String(tokens).padStart(5)} tokens | $${cost.toFixed(4)}`);
  }
  console.log(`  ${"".padEnd(16)}-|${"".padEnd(18)}-|${"".padEnd(13)}-|-`);
  console.log(`  ${"合计".padEnd(16)} | ${"".padEnd(18)} | ${String(agents.reduce((s, a) => s + a.usage.promptTokens + a.usage.completionTokens, 0)).padStart(5)} tokens | $${totalCost.toFixed(4)}`);

  // Cache hit 对比
  console.log("\n  💡 Cache Hit 对比 (Claude-3.5-Sonnet, 2000 token system prompt):");
  const noCache = pricing.calculateCost({ promptTokens: 60000, completionTokens: 8000, cacheHitTokens: 0, cacheWriteTokens: 0 }, "claude-3.5-sonnet");
  const withCache = pricing.calculateCost({ promptTokens: 60000, completionTokens: 8000, cacheHitTokens: 50000, cacheWriteTokens: 10000 }, "claude-3.5-sonnet");
  const savings = noCache - withCache;
  console.log(`  无缓存: $${noCache.toFixed(4)} → 有缓存(83% hit): $${withCache.toFixed(4)} → 节省: $${savings.toFixed(4)} (${((savings / noCache) * 100).toFixed(1)}%)`);

  // --- Phase 2: 预算层级管理 ---
  console.log("\n📦 Phase 2: 预算层级管理");
  console.log("-".repeat(45));

  const budgetTree: BudgetNode = {
    id: "org-acme", level: "org", name: "🏢 ACME Corp", monthlyLimit: 10000, softLimit: 8000, currentSpend: 0, alerts: [],
    children: [{
      id: "team-eng", level: "team", name: "👥 工程团队", monthlyLimit: 3000, softLimit: 2400, currentSpend: 0, alerts: [],
      children: [
        { id: "user-alice", level: "user", name: "👤 Alice", monthlyLimit: 500, softLimit: 400, currentSpend: 0, alerts: [], children: [] },
        { id: "user-bob", level: "user", name: "👤 Bob", monthlyLimit: 500, softLimit: 400, currentSpend: 0, alerts: [], children: [] },
        { id: "key-ci", level: "key", name: "🔑 CI/CD Key", monthlyLimit: 200, softLimit: 160, currentSpend: 0, alerts: [], children: [] },
      ],
    }],
  };

  const budget = new BudgetManager(budgetTree);

  // 模拟 Alice 的 Agent 运行
  console.log("\n  模拟 Alice 运行 10 个 Agent 任务...");
  const aliceSpends = [0.045, 0.052, 0.048, 0.055, 0.061, 0.058, 0.063, 0.051, 0.070, 0.087];
  let allAlerts: BudgetAlert[] = [];

  for (let i = 0; i < aliceSpends.length; i++) {
    const cost = aliceSpends[i];
    const checkResult = budget.checkBudget("user-alice", cost);
    if (checkResult) {
      allAlerts.push(checkResult);
      console.log(`  任务${i + 1}: 💰 $${cost.toFixed(3)} → ${checkResult.message}`);
    } else {
      const alerts = budget.spend("user-alice", cost);
      allAlerts.push(...alerts);
      const status = budget.getBudgetStatus();
      const aliceStatus = status.find(s => s.node.id === "user-alice")!;
      console.log(`  任务${i + 1}: 💰 $${cost.toFixed(3)} → Alice 累计: $${aliceStatus.node.currentSpend.toFixed(2)}/${aliceStatus.node.monthlyLimit} (${aliceStatus.usagePercent.toFixed(1)}%) ${aliceStatus.status === "OK" ? "✅" : aliceStatus.status === "WARNING" ? "⚠️" : "🚨"}`);
    }
  }

  // 显示所有预算状态
  console.log("\n  📊 预算全景:");
  const fullStatus = budget.getBudgetStatus();
  for (const s of fullStatus) {
    const bar = "█".repeat(Math.min(30, Math.round(s.usagePercent / 100 * 30)));
    const space = "░".repeat(30 - bar.length);
    const icon = s.status === "OK" ? "🟢" : s.status === "WARNING" ? "🟡" : "🔴";
    console.log(`  ${icon} ${s.node.name.padEnd(16)} | ${bar}${space} | ${s.usagePercent.toFixed(1)}% | $${s.node.currentSpend.toFixed(2)} / $${s.node.monthlyLimit.toFixed(2)}`);
  }

  // --- Phase 3: 成本漂移检测 ---
  console.log("\n📦 Phase 3: 成本漂移检测");
  console.log("-".repeat(45));

  const driftDetector = new DriftDetector();

  // 构建基线（15 个正常调用，平均 ~$0.08）
  console.log("\n  构建基线 (15 次正常调用)...");
  for (let i = 0; i < 15; i++) {
    const cost = 0.06 + Math.random() * 0.04; // $0.06-$0.10
    driftDetector.recordCall("gpt-4o", cost);
  }

  // 注入异常（10 次成本上漂的调用，平均 ~$0.15）
  console.log("  注入异常 (10 次高成本调用 — 模拟 Prompt 膨胀)...");
  for (let i = 0; i < 10; i++) {
    const cost = 0.12 + Math.random() * 0.06; // $0.12-$0.18
    driftDetector.recordCall("gpt-4o", cost);
  }

  const drift = driftDetector.calculateDrift("gpt-4o");
  const severityIcon = drift.severity === "HIGH" ? "🔴" : drift.severity === "MEDIUM" ? "🟡" : drift.severity === "LOW" ? "🔵" : "🟢";

  console.log(`\n  基线成本: 平均 $${drift.baseline.avgCostPerCall.toFixed(4)} (σ=$${drift.baseline.stdDev.toFixed(4)})`);
  console.log(`  当前成本: 平均 $${drift.current.avgCostPerCall.toFixed(4)} (σ=$${drift.current.stdDev.toFixed(4)})`);
  console.log(`  漂移幅度: ${drift.driftPercent > 0 ? "+" : ""}${drift.driftPercent.toFixed(1)}% ${severityIcon} ${drift.severity}`);
  console.log(`  建议操作:`);
  drift.suggestions.forEach(s => console.log(`    → ${s}`));

  // --- Phase 4: Cost-Per-Outcome ---
  console.log("\n📦 Phase 4: Cost-Per-Outcome 计算");
  console.log("-".repeat(45));

  const tracker = new CostOutcomeTracker();
  const sessionId = "session-20260623-001";

  tracker.startSession(sessionId);

  // 模拟一个完整 Agent 会话
  console.log("\n  模拟一次完整的 Agent 开发任务:");
  const tasks = [
    { action: "Orchestrator 分解任务", cost: 0.035, model: "gpt-4o" },
    { action: "Code Generator 生成代码", cost: 0.142, model: "claude-3.5-sonnet" },
    { action: "Code Reviewer 审查", cost: 0.086, model: "claude-3.5-sonnet" },
    { action: "Code Generator 修复问题", cost: 0.098, model: "claude-3.5-sonnet" },
    { action: "Test Writer 生成测试", cost: 0.072, model: "gpt-4o" },
    { action: "Synthesizer 汇总结果", cost: 0.022, model: "deepseek-v3" },
  ];

  for (const task of tasks) {
    tracker.recordCall(sessionId, task.cost, task.model);
    console.log(`  💰 $${task.cost.toFixed(3)} — ${task.action}`);
  }

  // 记录产出
  tracker.recordOutcome(sessionId, "code-generation", true);
  tracker.recordOutcome(sessionId, "code-generation", true);  // 修复也算
  tracker.recordOutcome(sessionId, "code-review", true);
  tracker.recordOutcome(sessionId, "code-review", false);     // 有一轮审查发现了问题
  tracker.recordOutcome(sessionId, "test-generation", true);
  tracker.recordOutcome(sessionId, "synthesis", true);

  const cpo = tracker.getCostPerOutcome(sessionId);

  console.log(`\n  📊 Cost-Per-Outcome 分析:`);
  console.log(`  总会话成本: $${cpo.totalSessionCost.toFixed(4)}`);
  console.log(`  成功产出: ${cpo.successfulOutcomes}/${tasks.length} 个`);
  console.log(`  每次成功产出平均成本: $${cpo.costPerSuccess.toFixed(4)}`);
  console.log(`\n  按产出类型:`);
  for (const [type, data] of Object.entries(cpo.byType)) {
    console.log(`  📦 ${type.padEnd(18)}: ${data.count}次 | 均摊成本: $${data.costPerUnit.toFixed(4)}`);
  }

  // --- 全景总结 ---
  console.log("\n" + "=".repeat(65));
  console.log("📊 成本追踪器总结\n");
  console.log(`  定价引擎: ${pricing.getAllModels().length} 个模型已注册`);
  console.log(`  预算管理: ${fullStatus.length} 个预算节点，${allAlerts.filter(a => a.type === "SOFT_LIMIT").length} 个软限制告警`);
  console.log(`  漂移检测: ${drift.severity} 级漂移 (${drift.driftPercent > 0 ? "+" : ""}${drift.driftPercent.toFixed(1)}%)`);
  console.log(`  成本产出: 每次成功 $${cpo.costPerSuccess.toFixed(4)}`);

  console.log("\n💡 核心收获:");
  console.log("  - Token 是不可见的抽象，美元才是业务语言——PricingEngine 完成了这个翻译");
  console.log("  - 预算的五级层级让\"谁花了多少钱\"一目了然，向上传播保证支出不会从缝隙漏掉");
  console.log("  - 成本漂移是无声杀手——30% 的涨幅如果不监控，一个月后就是倍增");
  console.log("  - 成本产出分析回答的是\"值不值\"——只知道花了 $0.45 不够，要知道这 $0.45 产出了一个代码审查");
}

main().catch((err) => {
  console.error("❌ cost-tracker error:", err);
  process.exit(1);
});
