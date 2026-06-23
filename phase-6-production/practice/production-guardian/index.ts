/**
 * 生产守护总成：优雅关闭 + 模型降级链 + 金丝雀发布 + 告警规则引擎
 *
 * 设计理念（对应 theory/03-production-observability.md §8-9）：
 *   如果说 circuit-breaker 是独立的安全组件，production-guardian 就是"生产操作系统"——
 *   它把优雅关闭、多模型降级、金丝雀发布和告警规则整合成一个统一的生产守护层。
 *   每个模块独立可用，但组合在一起才构成完整的生产守护体系。
 *
 * 运行：npm run production-guardian
 */

// ============================================================
// Types
// ============================================================

interface ShutdownConfig {
  drainTimeoutMs: number;
  forceExitTimeoutMs: number;
}

interface ModelConfig {
  name: string;
  provider: string;
  model: string;
  priority: number;
  costMultiplier: number;
}

interface FallbackResult {
  modelUsed: string;
  result: string;
  fallbackTriggered: boolean;
  fallbackReason?: string;
  latencyMs: number;
  cost: number;
}

interface CanaryConfig {
  stableModel: ModelConfig;
  canaryModel: ModelConfig;
  canaryPercent: number;
  minSampleSize: number;
}

interface CanaryStepResult {
  step: number;
  canaryPercent: number;
  stableScore: number;
  canaryScore: number;
  shouldPromote: boolean;
  shouldRollback: boolean;
  decision: "PROMOTE" | "ROLLBACK" | "CONTINUE";
  reason: string;
}

interface AlertRule {
  id: string;
  metric: string;
  condition: "ABOVE" | "BELOW";
  threshold: number;
  cooldownMs: number;
  severity: "CRITICAL" | "WARNING" | "INFO";
}

interface Alert {
  ruleId: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: "CRITICAL" | "WARNING" | "INFO";
  timestamp: number;
  message: string;
}

// ============================================================
// 1. GracefulShutdown — 优雅关闭
// ============================================================

class GracefulShutdown {
  private cleanupHandlers = new Map<string, () => Promise<void>>();
  private inFlight = 0;
  private shuttingDown = false;
  private readonly startTime: number;

  constructor(private config: ShutdownConfig) {
    this.startTime = Date.now();
  }

  registerCleanup(name: string, handler: () => Promise<void>): void {
    this.cleanupHandlers.set(name, handler);
  }

  trackRequest<T>(fn: () => Promise<T>): () => Promise<T> {
    return async () => {
      this.inFlight++;
      try {
        return await fn();
      } finally {
        this.inFlight--;
      }
    };
  }

  async simulateShutdown(): Promise<string[]> {
    const log: string[] = [];
    this.shuttingDown = true;

    log.push(`🛑 收到关闭信号 (模拟)`);
    log.push(`   进行中请求: ${this.inFlight}`);

    // Phase 1: 停止接受新请求
    log.push(`📴 Phase 1: 停止接受新请求`);

    // Phase 2: 等待进行中请求排空
    log.push(`⏳ Phase 2: 等待 ${this.inFlight} 个进行中任务完成...`);
    const drainStart = Date.now();
    while (this.inFlight > 0 && Date.now() - drainStart < this.config.drainTimeoutMs) {
      await this.sleep(50);
    }

    if (this.inFlight > 0) {
      log.push(`   ⚠️  排空超时，${this.inFlight} 个任务未完成（强制终止）`);
    } else {
      log.push(`   ✅ 所有任务已完成`);
    }

    // Phase 3: 执行清理回调
    log.push(`🧹 Phase 3: 执行 ${this.cleanupHandlers.size} 个清理回调`);
    for (const [name, handler] of this.cleanupHandlers) {
      try {
        await handler();
        log.push(`   ✅ ${name}: 完成`);
      } catch (err: any) {
        log.push(`   ❌ ${name}: ${err.message}`);
      }
    }

    // Phase 4: 退出
    log.push(`👋 Phase 4: 进程即将退出`);
    const totalTime = Date.now() - this.startTime;
    log.push(`   本次运行时长: ${(totalTime / 1000).toFixed(1)}s`);

    this.shuttingDown = false;
    return log;
  }

  getStatus(): { running: boolean; inFlightCount: number; shuttingDown: boolean } {
    return {
      running: !this.shuttingDown,
      inFlightCount: this.inFlight,
      shuttingDown: this.shuttingDown,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// 2. ModelFallbackChain — 多模型降级链
// ============================================================

class ModelFallbackChain {
  private models: ModelConfig[];
  private stats = new Map<string, { calls: number; failures: number; totalLatency: number }>();

  constructor(models: ModelConfig[]) {
    this.models = models.sort((a, b) => a.priority - b.priority);
    for (const m of models) {
      this.stats.set(m.name, { calls: 0, failures: 0, totalLatency: 0 });
    }
  }

  async execute(
    fn: (model: ModelConfig) => Promise<{ result: string; latencyMs: number }>
  ): Promise<FallbackResult> {
    let lastError: string | undefined;

    for (const model of this.models) {
      const start = Date.now();

      try {
        const output = await fn(model);
        const latencyMs = Date.now() - start;

        // Update stats
        const s = this.stats.get(model.name)!;
        s.calls++;
        s.totalLatency += latencyMs;

        return {
          modelUsed: model.name,
          result: output.result,
          fallbackTriggered: model.priority > this.models[0].priority,
          fallbackReason: model.priority > 1 ? `优先级${model.priority}，因为 ${lastError} 而降级` : undefined,
          latencyMs,
          cost: 0.005 * model.costMultiplier * (1 + output.result.length / 500),
        };
      } catch (err: any) {
        lastError = err.message;
        const s = this.stats.get(model.name)!;
        s.failures++;

        // 如果是最后一个模型，抛出错误
        if (model.priority === this.models[this.models.length - 1].priority) {
          return {
            modelUsed: model.name,
            result: `ERROR: 所有模型均失败。最后错误: ${lastError}`,
            fallbackTriggered: true,
            fallbackReason: `全部 ${this.models.length} 个模型均不可用`,
            latencyMs: Date.now() - start,
            cost: 0,
          };
        }
      }
    }

    // 不应到达这里
    return {
      modelUsed: "none",
      result: "ERROR: 未配置任何模型",
      fallbackTriggered: true,
      fallbackReason: "无可用模型",
      latencyMs: 0,
      cost: 0,
    };
  }

  getFallbackStats(): { model: string; calls: number; failures: number; avgLatency: number }[] {
    return this.models.map(m => {
      const s = this.stats.get(m.name)!;
      return {
        model: m.name,
        calls: s.calls,
        failures: s.failures,
        avgLatency: s.calls > 0 ? s.totalLatency / s.calls : 0,
      };
    });
  }
}

// ============================================================
// 3. CanarySimulator — 金丝雀发布模拟
// ============================================================

class CanarySimulator {
  private progress: {
    currentStep: number;
    totalSteps: number;
    canaryPercent: number;
    status: "RUNNING" | "PROMOTED" | "ROLLED_BACK";
    steps: CanaryStepResult[];
  };

  constructor() {
    this.progress = { currentStep: 0, totalSteps: 4, canaryPercent: 0, status: "RUNNING", steps: [] };
  }

  async runCanary(config: CanaryConfig): Promise<CanaryStepResult[]> {
    const steps: CanaryStepResult[] = [];
    const percents = [5, 25, 50, 100];

    for (let i = 0; i < percents.length; i++) {
      const percent = percents[i];
      this.progress.currentStep = i + 1;
      this.progress.canaryPercent = percent;

      // 模拟质量评分（加入随机性来模拟真实场景）
      const stableBase = 0.92 + Math.random() * 0.04;  // 0.92-0.96
      const canaryBase = 0.90 + Math.random() * 0.08;  // 0.90-0.98

      // 模拟：金丝雀在第 50% 步时遇到问题
      const canaryIssue = percent >= 50 && Math.random() < 0.4;
      const canaryScore = canaryIssue ? 0.82 + Math.random() * 0.05 : canaryBase;

      const shouldRollback = canaryScore < 0.85; // 质量明显下降
      const shouldPromote = !shouldRollback && percent === 100;
      const decision = shouldRollback ? "ROLLBACK" : shouldPromote ? "PROMOTE" : "CONTINUE";

      const reason = shouldRollback
        ? `金丝雀质量(${canaryScore.toFixed(2)})显著低于基线(${stableBase.toFixed(2)})，差值 > 5%`
        : shouldPromote
          ? `金丝雀质量(${canaryScore.toFixed(2)})稳定，全量推广`
          : `金丝雀质量(${canaryScore.toFixed(2)})在可接受范围内，继续扩大`;

      const step: CanaryStepResult = {
        step: i + 1,
        canaryPercent: percent,
        stableScore: stableBase,
        canaryScore,
        shouldPromote,
        shouldRollback,
        decision,
        reason,
      };

      steps.push(step);
      this.progress.steps.push(step);

      // 模拟金丝雀运行时间
      await this.sleep(200);

      if (shouldRollback) {
        this.progress.status = "ROLLED_BACK";
        break;
      }
    }

    if (this.progress.status !== "ROLLED_BACK") {
      this.progress.status = "PROMOTED";
    }

    return steps;
  }

  getProgress() {
    return { ...this.progress };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// 4. AlertManager — 告警规则引擎
// ============================================================

class AlertManager {
  private rules: AlertRule[] = [];
  private alerts: Alert[] = [];
  private lastFired = new Map<string, number>();

  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  evaluate(metrics: Record<string, number>): Alert[] {
    const now = Date.now();
    const fired: Alert[] = [];

    for (const rule of this.rules) {
      const currentValue = metrics[rule.metric];
      if (currentValue === undefined) continue;

      const triggered =
        rule.condition === "ABOVE" ? currentValue > rule.threshold : currentValue < rule.threshold;

      if (!triggered) continue;

      // Cooldown check
      const lastFire = this.lastFired.get(rule.id);
      if (lastFire && now - lastFire < rule.cooldownMs) {
        continue; // 还在冷却期，抑制告警
      }

      const alert: Alert = {
        ruleId: rule.id,
        metric: rule.metric,
        currentValue,
        threshold: rule.threshold,
        severity: rule.severity,
        timestamp: now,
        message: `[${rule.severity}] ${rule.metric}: ${currentValue.toFixed(2)} ${rule.condition === "ABOVE" ? ">" : "<"} ${rule.threshold}${rule.condition === "ABOVE" ? "" : ""}`,
      };

      this.alerts.push(alert);
      this.lastFired.set(rule.id, now);
      fired.push(alert);
    }

    return fired;
  }

  getActiveAlerts(): Alert[] {
    return [...this.alerts].sort((a, b) => {
      const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  getAlertSummary(): { critical: number; warning: number; info: number; total: number } {
    return {
      critical: this.alerts.filter(a => a.severity === "CRITICAL").length,
      warning: this.alerts.filter(a => a.severity === "WARNING").length,
      info: this.alerts.filter(a => a.severity === "INFO").length,
      total: this.alerts.length,
    };
  }
}

// ============================================================
// Demo
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("\n🏭 生产守护总成 Demo\n");
  console.log("=".repeat(65));

  // --- Phase 1: 优雅关闭 ---
  console.log("\n📦 Phase 1: 优雅关闭流程");
  console.log("-".repeat(45));

  const shutdown = new GracefulShutdown({
    drainTimeoutMs: 5000,
    forceExitTimeoutMs: 10000,
  });

  // 注册清理回调
  shutdown.registerCleanup("checkpoint-task-state", async () => {
    await sleep(100);
    console.log("     → 已保存任务状态到磁盘");
  });

  shutdown.registerCleanup("flush-audit-log", async () => {
    await sleep(80);
    console.log("     → 审计日志已刷新");
  });

  shutdown.registerCleanup("close-api-connections", async () => {
    await sleep(50);
    console.log("     → API 连接已关闭");
  });

  console.log(`  注册了 ${3} 个清理回调`);

  // 模拟一些进行中请求
  const simulateRequest = shutdown.trackRequest(async () => {
    await sleep(500 + Math.random() * 1000);
    return "done";
  });

  const promises = [simulateRequest(), simulateRequest(), simulateRequest()];
  // 不 await promises — 它们在"进行中"
  await sleep(100);

  // 触发关闭
  const shutdownLog = await shutdown.simulateShutdown();
  console.log("");
  for (const line of shutdownLog) {
    console.log(`  ${line}`);
  }

  // 等待剩余模拟请求完成（避免 unhandled rejection）
  await Promise.allSettled(promises);

  // --- Phase 2: 多模型降级链 ---
  console.log("\n📦 Phase 2: 多模型降级链");
  console.log("-".repeat(45));

  const models: ModelConfig[] = [
    { name: "Claude-3.5-Sonnet", provider: "anthropic", model: "claude-3.5-sonnet", priority: 1, costMultiplier: 1.0 },
    { name: "GPT-4o", provider: "openai", model: "gpt-4o", priority: 2, costMultiplier: 0.85 },
    { name: "DeepSeek-V3", provider: "deepseek", model: "deepseek-v3", priority: 3, costMultiplier: 0.15 },
  ];

  const fallback = new ModelFallbackChain(models);

  // 模拟 5 个请求，不同失败场景
  const scenarios = [
    { name: "场景1: 全部正常", primaryFail: false, secondaryFail: false },
    { name: "场景2: 主模型超时", primaryFail: true, secondaryFail: false },
    { name: "场景3: 主+次都超时", primaryFail: true, secondaryFail: true },
    { name: "场景4: 主模型限流(429)", primaryFail: true, secondaryFail: false },
    { name: "场景5: 全部正常(cache hit)", primaryFail: false, secondaryFail: false },
  ];

  console.log("");
  for (const scenario of scenarios) {
    const result = await fallback.execute(async (model) => {
      // 模拟失败
      if (model.priority === 1 && scenario.primaryFail) {
        throw new Error(model.priority === 1 ? "Timeout after 30s" : "503 Service Unavailable");
      }
      if (model.priority === 2 && scenario.secondaryFail) {
        throw new Error("503 Service Unavailable");
      }
      // 模拟成功
      await sleep(20 + Math.random() * 30);
      return {
        result: `[${model.name}] 任务完成: ${scenario.name.split(":")[1]?.trim() || "OK"}`,
        latencyMs: 200 + Math.random() * 500,
      };
    });

    const fbIcon = result.fallbackTriggered ? "🔄" : "✅";
    console.log(`  ${fbIcon} ${scenario.name.padEnd(20)} | 使用: ${result.modelUsed.padEnd(18)} | ${result.fallbackTriggered ? "降级原因: " + (result.fallbackReason || "N/A") : "主模型成功"}`);
  }

  // Stats
  console.log("\n  📊 降级统计:");
  const stats = fallback.getFallbackStats();
  for (const s of stats) {
    console.log(`  ${s.model.padEnd(18)}: ${s.calls}调用 ${s.failures}失败 avg=${s.avgLatency.toFixed(0)}ms`);
  }

  // --- Phase 3: 金丝雀发布 ---
  console.log("\n📦 Phase 3: 金丝雀发布模拟");
  console.log("-".repeat(45));

  const canary = new CanarySimulator();

  const config: CanaryConfig = {
    stableModel: models[0],   // Claude-3.5-Sonnet
    canaryModel: models[1],   // GPT-4o (作为 canary)
    canaryPercent: 5,
    minSampleSize: 100,
  };

  console.log("\n  🐤 开始金丝雀发布: GPT-4o → 替代 Claude-3.5-Sonnet");
  console.log("  " + "─".repeat(50));

  // 控制随机种子让金丝雀在 50% 时出现问题
  const steps = await canary.runCanary(config);

  for (const step of steps) {
    const icon = step.decision === "PROMOTE" ? "🚀" : step.decision === "ROLLBACK" ? "⏪" : "➡️";
    const stableBar = "█".repeat(Math.round(step.stableScore * 25));
    const canaryBar = "█".repeat(Math.round(step.canaryScore * 25));
    console.log(`\n  ${icon} 步骤${step.step}: ${step.canaryPercent}% 流量`);
    console.log(`     基线(${config.stableModel.name.padEnd(18)}): ${stableBar}${"░".repeat(25 - stableBar.length)} ${step.stableScore.toFixed(3)}`);
    console.log(`     金丝雀(${config.canaryModel.name.padEnd(18)}): ${canaryBar}${"░".repeat(25 - canaryBar.length)} ${step.canaryScore.toFixed(3)}`);
    console.log(`     决策: ${step.decision}`);
    console.log(`     原因: ${step.reason}`);
  }

  const progress = canary.getProgress();
  console.log(`\n  📊 最终状态: ${progress.status} (完成了 ${progress.currentStep}/${progress.totalSteps} 步)`);

  // --- Phase 4: 告警规则 ---
  console.log("\n📦 Phase 4: 告警规则引擎");
  console.log("-".repeat(45));

  const alertManager = new AlertManager();

  alertManager.addRule({ id: "r1", metric: "error_rate", condition: "ABOVE", threshold: 0.05, cooldownMs: 3000, severity: "CRITICAL" });
  alertManager.addRule({ id: "r2", metric: "p99_latency_sec", condition: "ABOVE", threshold: 30, cooldownMs: 5000, severity: "WARNING" });
  alertManager.addRule({ id: "r3", metric: "cost_per_call", condition: "ABOVE", threshold: 0.5, cooldownMs: 5000, severity: "WARNING" });
  alertManager.addRule({ id: "r4", metric: "success_rate", condition: "BELOW", threshold: 0.9, cooldownMs: 3000, severity: "CRITICAL" });

  // 模拟 20 轮指标采集
  console.log("\n  模拟 20 轮指标采集...");
  let totalFired = 0;

  for (let round = 1; round <= 20; round++) {
    // 偶尔注入异常
    const anomaly = round === 5 || round === 13;
    const metrics: Record<string, number> = anomaly
      ? { error_rate: 0.08, p99_latency_sec: 35, cost_per_call: 0.35, success_rate: 0.87 }
      : { error_rate: 0.02 + Math.random() * 0.02, p99_latency_sec: 18 + Math.random() * 10, cost_per_call: 0.15 + Math.random() * 0.2, success_rate: 0.92 + Math.random() * 0.06 };

    const fired = alertManager.evaluate(metrics);

    if (fired.length > 0 || anomaly) {
      const icon = anomaly ? "🔴" : "🟢";
      const firedSummary = fired.map(a => `${a.severity}:${a.metric}`).join(", ");
      console.log(`  轮次${String(round).padStart(2)} ${icon}: error=${(metrics.error_rate * 100).toFixed(1)}% p99=${metrics.p99_latency_sec.toFixed(0)}s cost=$${metrics.cost_per_call.toFixed(2)} success=${(metrics.success_rate * 100).toFixed(1)}% ${fired.length > 0 ? `→ 🔔 ${firedSummary}` : ""}`);
      totalFired += fired.length;
    }
  }

  const alertSummary = alertManager.getAlertSummary();
  console.log(`\n  📊 告警统计: ${alertSummary.total} 次告警 (🔴CRITICAL:${alertSummary.critical} 🟡WARNING:${alertSummary.warning} 🔵INFO:${alertSummary.info})`);

  // 显示最近告警
  const recentAlerts = alertManager.getActiveAlerts().slice(-5);
  if (recentAlerts.length > 0) {
    console.log("\n  最近 5 条告警:");
    for (const alert of recentAlerts) {
      const severityIcon = alert.severity === "CRITICAL" ? "🔴" : alert.severity === "WARNING" ? "🟡" : "🔵";
      console.log(`  ${severityIcon} ${new Date(alert.timestamp).toISOString().slice(11, 19)} | ${alert.metric}: ${alert.currentValue.toFixed(2)} | ${alert.message}`);
    }
  }

  // --- 全景总结 ---
  console.log("\n" + "=".repeat(65));
  console.log("📊 生产守护总成总结\n");
  console.log(`  优雅关闭: ${3} 个清理回调, 排空超时=${shutdown.getStatus().shuttingDown ? "未完成" : "已完成"}`);
  console.log(`  模型降级: ${models.length} 级链, 主模型成功率=${((stats[0].calls - stats[0].failures) / Math.max(1, stats[0].calls) * 100).toFixed(0)}%`);
  console.log(`  金丝雀发布: ${progress.status} (${progress.currentStep}/${progress.totalSteps}步)`);
  console.log(`  告警引擎: ${alertSummary.total} 次触发, ${alertManager.getActiveAlerts().length} 条活跃`);

  console.log("\n💡 核心收获:");
  console.log("  - 优雅关闭不是技术细节——是资产保护。未完成的 Agent 任务是花了钱的，不能随手丢了");
  console.log("  - 降级链的\"成本感知\"很重要——降级后模型可能更便宜，但需要标记 degraded 让用户有心理预期");
  console.log("  - 金丝雀的核心不是流量百分比——是\"行为质量对比\"。AI 特有的非确定性意味着错误率不够，要看输出质量");
  console.log("  - 告警的 cooldown 是\"可用性保护\"——没有 cooldown 的告警系统会在异常时自己变成噪音源");
}

main().catch((err) => {
  console.error("❌ production-guardian error:", err);
  process.exit(1);
});
