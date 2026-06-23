/**
 * 上下文预算管理器
 *
 * 设计理念（对应 theory/03 §5）：
 *   多 Agent 系统中，每个 Agent 有独立的 Context 预算。
 *   Orchestrator 需要全局分配，防止某个 Agent 吃光预算导致其他 Agent 无法运行。
 *
 * 运行：npm run budget
 */

// ===== Types =====

interface BudgetConsumer {
  id: string;
  name: string;
  role: "orchestrator" | "worker" | "synthesizer";
  priority: "critical" | "high" | "medium" | "low";
  estimatedComplexity: number; // 1-10
  minTokens: number; // 最少需要多少
}

interface BudgetAllocation {
  consumerId: string;
  allocatedTokens: number;
  usageRate: number; // 0-1，当前使用率
}

interface BudgetEvent {
  type: "ALLOCATED" | "WARNING" | "EXCEEDED" | "RELEASED";
  consumerId: string;
  timestamp: number;
  detail: string;
}

// ===== Context Budget Manager =====

class ContextBudgetManager {
  private totalBudget: number;
  private allocations: Map<string, BudgetAllocation> = new Map();
  private events: BudgetEvent[] = [];
  private usageHistory: Map<string, number[]> = new Map();

  constructor(totalBudget: number) {
    this.totalBudget = totalBudget;
  }

  /**
   * 为任务分配 Context 预算
   *
   * 分配策略：
   *   1. Orchestrator 固定 15%
   *   2. Worker 按复杂度比例分配
   *   3. 单个 Agent 上限 25%（防止垄断）
   *   4. 预留 10% 作为弹性缓冲
   */
  allocate(consumers: BudgetConsumer[]): Map<string, BudgetAllocation> {
    const orchBudget = Math.floor(this.totalBudget * 0.15);
    const reserveBudget = Math.floor(this.totalBudget * 0.1);
    const workerPool = this.totalBudget - orchBudget - reserveBudget;

    // Orchestrator 固定分配
    const orch = consumers.find((c) => c.role === "orchestrator");
    if (orch) {
      this.allocations.set(orch.id, {
        consumerId: orch.id,
        allocatedTokens: orchBudget,
        usageRate: 0,
      });
      this._logEvent("ALLOCATED", orch.id, `Orchestrator: ${orchBudget} tokens`);
    }

    // Worker 按复杂度分配
    const workers = consumers.filter((c) => c.role === "worker");
    const totalComplexity = workers.reduce(
      (s, w) => s + w.estimatedComplexity,
      0
    );

    for (const worker of workers) {
      const share = Math.floor(
        (worker.estimatedComplexity / totalComplexity) * workerPool
      );
      // 单 Agent 上限 25% 总预算
      const capped = Math.min(share, Math.floor(this.totalBudget * 0.25));
      // 不能低于其最小需求
      const allocated = Math.max(capped, worker.minTokens);

      this.allocations.set(worker.id, {
        consumerId: worker.id,
        allocatedTokens: allocated,
        usageRate: 0,
      });
      this._logEvent(
        "ALLOCATED",
        worker.id,
        `${worker.name}: ${allocated} tokens (复杂度 ${worker.estimatedComplexity}/10)`
      );
    }

    // Synthesizer 从弹性预算中分配
    const synth = consumers.find((c) => c.role === "synthesizer");
    if (synth) {
      this.allocations.set(synth.id, {
        consumerId: synth.id,
        allocatedTokens: reserveBudget,
        usageRate: 0,
      });
      this._logEvent("ALLOCATED", synth.id, `Synthesizer: ${reserveBudget} tokens (弹性预算)`);
    }

    return this.allocations;
  }

  /** 更新 Consumer 的 token 使用量并检测是否超预算 */
  updateUsage(consumerId: string, usedTokens: number): BudgetEvent | null {
    const alloc = this.allocations.get(consumerId);
    if (!alloc) return null;

    alloc.usageRate = usedTokens / alloc.allocatedTokens;

    // 追踪历史
    if (!this.usageHistory.has(consumerId)) {
      this.usageHistory.set(consumerId, []);
    }
    this.usageHistory.get(consumerId)!.push(usedTokens);

    // 告警阈值
    if (alloc.usageRate > 0.9) {
      const event: BudgetEvent = {
        type: "EXCEEDED",
        consumerId,
        timestamp: Date.now(),
        detail: `预算超 90%: ${usedTokens}/${alloc.allocatedTokens}`,
      };
      this._logEvent("EXCEEDED", consumerId, event.detail);
      return event;
    }

    if (alloc.usageRate > 0.7) {
      const event: BudgetEvent = {
        type: "WARNING",
        consumerId,
        timestamp: Date.now(),
        detail: `预算超 70%: ${usedTokens}/${alloc.allocatedTokens}`,
      };
      this._logEvent("WARNING", consumerId, event.detail);
      return event;
    }

    return null;
  }

  /** 释放某个 Consumer 的预算 */
  release(consumerId: string): void {
    const alloc = this.allocations.get(consumerId);
    if (alloc) {
      this._logEvent(
        "RELEASED",
        consumerId,
        `释放 ${alloc.allocatedTokens} tokens (峰值使用率: ${(alloc.usageRate * 100).toFixed(0)}%)`
      );
      this.allocations.delete(consumerId);
    }
  }

  /** 获取全局预算使用统计 */
  getGlobalStats(): {
    totalBudget: number;
    allocated: number;
    used: number;
    remaining: number;
    byConsumer: { id: string; allocated: number; used: number; usageRate: number }[];
  } {
    let allocated = 0;
    let used = 0;
    const byConsumer: any[] = [];

    for (const alloc of this.allocations.values()) {
      allocated += alloc.allocatedTokens;
      const usedTokens = Math.round(
        alloc.allocatedTokens * alloc.usageRate
      );
      used += usedTokens;
      byConsumer.push({
        id: alloc.consumerId,
        allocated: alloc.allocatedTokens,
        used: usedTokens,
        usageRate: alloc.usageRate,
      });
    }

    return {
      totalBudget: this.totalBudget,
      allocated,
      used,
      remaining: this.totalBudget - used,
      byConsumer,
    };
  }

  private _logEvent(
    type: BudgetEvent["type"],
    consumerId: string,
    detail: string
  ): void {
    this.events.push({ type, consumerId, timestamp: Date.now(), detail });
  }
}

// ===== Demo =====

async function main() {
  console.log("\n💰 Context 预算管理 Demo\n");
  console.log("=".repeat(65));

  // 总预算 200K tokens（模拟 Claude 200K context window）
  const TOTAL_BUDGET = 200_000;

  const manager = new ContextBudgetManager(TOTAL_BUDGET);

  // 定义消费者
  const consumers: BudgetConsumer[] = [
    {
      id: "orchestrator",
      name: "主 Orchestrator",
      role: "orchestrator",
      priority: "critical",
      estimatedComplexity: 8,
      minTokens: 10000,
    },
    {
      id: "worker-code-gen",
      name: "代码生成 Agent",
      role: "worker",
      priority: "high",
      estimatedComplexity: 7,
      minTokens: 15000,
    },
    {
      id: "worker-code-review",
      name: "代码审查 Agent",
      role: "worker",
      priority: "high",
      estimatedComplexity: 6,
      minTokens: 12000,
    },
    {
      id: "worker-test-writer",
      name: "测试编写 Agent",
      role: "worker",
      priority: "medium",
      estimatedComplexity: 5,
      minTokens: 10000,
    },
    {
      id: "synthesizer",
      name: "汇总 Agent",
      role: "synthesizer",
      priority: "high",
      estimatedComplexity: 4,
      minTokens: 8000,
    },
  ];

  // 1. 分配预算
  console.log(`\n📊 1. 总预算: ${TOTAL_BUDGET.toLocaleString()} tokens\n`);
  const allocations = manager.allocate(consumers);

  // 2. 模拟各 Agent 使用 Token
  console.log("\n📈 2. 模拟各 Agent 执行\n");

  const simulateUsage = [
    { id: "orchestrator", tokens: 8000 },
    { id: "worker-code-gen", tokens: 35000 },
    { id: "worker-code-review", tokens: 22000 },
    { id: "worker-test-writer", tokens: 18000 },
    { id: "synthesizer", tokens: 5000 },
  ];

  for (const { id, tokens } of simulateUsage) {
    const alloc = allocations.get(id);
    if (!alloc) continue;

    console.log(
      `   ${id}: 使用 ${tokens.toLocaleString()} / ${alloc.allocatedTokens.toLocaleString()} tokens`
    );
    const event = manager.updateUsage(id, tokens);
    if (event) {
      const emoji = event.type === "EXCEEDED" ? "🚨" : "⚠️";
      console.log(`     ${emoji} ${event.detail}`);
    }
  }

  // 3. 全局统计
  console.log("\n📊 3. 全局预算状态\n");

  const stats = manager.getGlobalStats();

  // 水平柱状图
  stats.byConsumer.forEach((c) => {
    const barLen = Math.round((c.used / stats.totalBudget) * 50);
    const bar = "█".repeat(Math.min(barLen, 50));
    const pct = ((c.used / stats.totalBudget) * 100).toFixed(1);
    console.log(
      `   ${c.id.padEnd(22)} ${bar} ${c.used.toLocaleString().padStart(8)} tokens (${pct}%)`
    );
  });

  console.log(`\n   ${"总预算:"} ${stats.totalBudget.toLocaleString()} tokens`);
  console.log(`   ${"已使用:"} ${stats.used.toLocaleString()} tokens (${((stats.used / stats.totalBudget) * 100).toFixed(1)}%)`);
  console.log(`   ${"剩余:"} ${stats.remaining.toLocaleString()} tokens (${((stats.remaining / stats.totalBudget) * 100).toFixed(1)}%)`);

  // 4. 释放已完成 Agent 的预算
  console.log("\n🗑️ 4. 释放已完成 Agent 预算\n");
  manager.release("worker-code-gen");
  manager.release("worker-code-review");

  console.log("\n" + "=".repeat(65));
  console.log(
    "\n💡 Context 预算管理的核心：不超支、不浪费、弹性调度\n"
  );
  console.log("   预算 = 注意力。每个 Agent 的注意力有限，要精打细算。\n");
}

main().catch((err) => {
  console.error("❌ Budget error:", err);
  process.exit(1);
});
