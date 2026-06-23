# Agent 成本治理：从 Token 到商业价值

> 核心问题：一个能跑通的 Agent 原型和能控制成本的 Agent 产品之间，差了什么？答案是 **从 cost-per-token 到 cost-per-outcome 的视角转变**——不再问"一个 token 多少钱"，而是问"完成一个任务花了多少钱"。

---

## 1. 为什么 Agent 成本需要专门治理

### 1.1 单次调用 vs Agent 多步调用的成本放大

普通 LLM 应用：1 次 API 调用 → 1 次计费。

Agent 应用：
```
用户请求 "帮我写一个用户认证模块"
  → Orchestrator 分解任务        (1 次 LLM 调用, ~3K tokens)
  → Code Generator 生成代码      (1 次 LLM 调用, ~15K tokens)
  → Code Reviewer 审查           (1 次 LLM 调用, ~10K tokens)
  → Test Writer 生成测试         (1 次 LLM 调用, ~12K tokens)
  → Synthesizer 汇总结果         (1 次 LLM 调用, ~4K tokens)
  → 如果审查不通过 → 重试...     (又一轮 LLM 调用)
```

**一次用户请求 = 5-10 次 LLM 调用**。成本不再是一个 API call 的成本，而是一个任务的成本。

### 1.2 成本失控的四个典型场景

| 场景 | 表现 | 根因 |
|---|---|---|
| **循环爆炸** | Agent 陷入重试循环，同样任务连续调用 20 次 | 缺少循环检测 + max_turns 限制 |
| **Prompt 膨胀** | System prompt 从 500 tokens 慢慢涨到 3000 tokens | 无版本化 + 无 token 监控 |
| **模型升级陷阱** | 从 gpt-4o-mini 切到 gpt-4o 后账单翻 10 倍 | 无成本估算 + 无灰度对比 |
| **无归属黑洞** | 月度 $5,000 账单，但不知道哪个团队/功能花了多少 | 无标签体系 + 无成本归属 |

### 1.3 治理的四个层次

```
Level 4: 成本产出治理 — 每个任务 ROI 可量化
Level 3: 预算治理     — 组织/团队/用户/Key 层级限制
Level 2: 漂移治理     — 异常检测 + 告警
Level 1: 可见性治理   — Token 计数 + 成本归因
```

---

## 2. Token 级成本追踪

### 2.1 核心数据结构

```typescript
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  // Anthropic cache 专有字段，10x 便宜
  cacheHitTokens: number;
  cacheWriteTokens: number;
}

interface PricingTier {
  modelName: string;
  provider: "openai" | "anthropic" | "deepseek";
  promptPricePer1K: number;
  completionPricePer1K: number;
  cacheReadPricePer1K?: number;
}
```

### 2.2 定价表（2025-2026 年参考价格）

| 模型 | Provider | Prompt ($/1K tokens) | Completion ($/1K) | Cache Read ($/1K) |
|---|---|---|---|---|
| GPT-4o | openai | $0.0025 | $0.010 | — |
| GPT-4o-mini | openai | $0.00015 | $0.0006 | — |
| Claude 3.5 Sonnet | anthropic | $0.003 | $0.015 | $0.0003 |
| Claude 3.5 Haiku | anthropic | $0.0008 | $0.004 | $0.00008 |
| DeepSeek-V3 | deepseek | $0.00027 | $0.0011 | — |

### 2.3 Cache Hit——成本优化的最大杠杆

Anthropic 的 cache 定价约是标准 prompt 的 1/10。一个典型的 Agent 场景：System Prompt 在每次对话中重复发送。如果 System Prompt 是 2000 tokens：

- 无 cache：2000 × $0.003 / 1000 = $0.006 / 次
- 有 cache hit：2000 × $0.0003 / 1000 = $0.0006 / 次

**单次省 $0.0054**，10 万次对话 = 省 $540。对于高频 Agent 应用，cache hit rate 每提高 10%，约降低 8% 总成本。

```typescript
class PricingEngine {
  calculateCost(usage: TokenUsage, model: string): number {
    const tier = this.getPricing(model);
    let cost = 0;
    // Prompt tokens（含 cache 折扣）
    const uncachedPrompt = usage.promptTokens - usage.cacheHitTokens;
    cost += (uncachedPrompt / 1000) * tier.promptPricePer1K;
    cost += (usage.cacheHitTokens / 1000) * (tier.cacheReadPricePer1K ?? tier.promptPricePer1K);
    cost += (usage.cacheWriteTokens / 1000) * tier.promptPricePer1K; // 写入按原价
    // Completion tokens
    cost += (usage.completionTokens / 1000) * tier.completionPricePer1K;
    return cost;
  }
}
```

---

## 3. 预算层级体系

### 3.1 五级预算结构

```typescript
type BudgetLevel = "org" | "team" | "user" | "key" | "tag";

interface BudgetNode {
  id: string;
  level: BudgetLevel;
  name: string;
  monthlyLimit: number;      // 硬限制
  softLimit: number;         // 默认 80% monthlyLimit
  currentSpend: number;
  children: BudgetNode[];    // 下级预算
}

// 实例
const orgBudget: BudgetNode = {
  id: "org-1", level: "org", name: "公司", monthlyLimit: 10000, softLimit: 8000, currentSpend: 0,
  children: [{
    id: "team-eng", level: "team", name: "工程团队", monthlyLimit: 3000, softLimit: 2400, currentSpend: 0,
    children: [
      { id: "user-alice", level: "user", name: "Alice", monthlyLimit: 500, softLimit: 400, currentSpend: 0, children: [] },
      { id: "key-ci", level: "key", name: "CI/CD Key", monthlyLimit: 200, softLimit: 160, currentSpend: 0, children: [] },
    ]
  }]
};
```

### 3.2 核心规则

1. **向上传播**：子节点花费增加时，父节点同步增加
2. **软限制**：达到 80% 时发送告警但不阻断
3. **硬限制**：达到 100% 时阻断请求（返回 429）
4. **继承检查**：任意祖先节点超限都会阻断

```typescript
class BudgetManager {
  checkBudget(nodeId: string, estimatedCost: number): BudgetAlert | null {
    const node = this.findNode(nodeId);
    const ancestors = this.getAncestors(nodeId); // 包含自身

    for (const n of ancestors) {
      if (n.currentSpend + estimatedCost > n.monthlyLimit) {
        return { type: "HARD_LIMIT", message: `${n.name} 预算已耗尽` };
      }
      if (n.currentSpend + estimatedCost > n.softLimit) {
        return { type: "SOFT_LIMIT", message: `${n.name} 已达软限制` };
      }
    }
    return null; // 允许
  }
}
```

---

## 4. 成本漂移检测

### 4.1 为什么需要漂移检测

静态预算阈值不够——成本可能因为以下原因悄悄上漂：

- **模型版本升级**：OpenAI 推了新模型，价格更高但被自动升级
- **Prompt 膨胀**：不断往 System Prompt 加规则，从 500 → 3000 tokens
- **重试率上升**：某个工具不稳定导致 fallback 增多
- **用户行为变化**：用户开始问更复杂的问题

### 4.2 滑动窗口基线

```typescript
interface DriftReport {
  baseline: { avgCostPerCall: number; stdDev: number };
  current: { avgCostPerCall: number; stdDev: number };
  driftPercent: number;
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH";
}

class DriftDetector {
  private window: { model: string; cost: number }[] = [];
  private readonly WINDOW_SIZE = 30;

  calculateDrift(model: string): DriftReport {
    const calls = this.window.filter(c => c.model === model);
    const midPoint = Math.floor(calls.length / 2);
    const baseline = calls.slice(0, midPoint);
    const current = calls.slice(midPoint);

    const baselineAvg = avg(baseline.map(c => c.cost));
    const currentAvg = avg(current.map(c => c.cost));
    const driftPercent = ((currentAvg - baselineAvg) / baselineAvg) * 100;

    return {
      baseline: { avgCostPerCall: baselineAvg, stdDev: stdDev(baseline.map(c => c.cost)) },
      current: { avgCostPerCall: currentAvg, stdDev: stdDev(current.map(c => c.cost)) },
      driftPercent,
      severity: driftPercent > 50 ? "HIGH" : driftPercent > 30 ? "MEDIUM" : driftPercent > 10 ? "LOW" : "NONE",
    };
  }
}
```

---

## 5. 从 Cost-Per-Token 到 Cost-Per-Outcome

### 5.1 为什么 token 价格是不够的指标

| 指标 | 含义 | 局限性 |
|---|---|---|
| Cost/token | 单个 token 的价格 | 不反映任务效率 |
| Cost/call | 单次调用的价格 | 不反映是否成功 |
| **Cost/outcome** | 完成一个有效结果的价格 | **这就是商业价值** |

### 5.2 计算模型

```typescript
interface CostPerOutcome {
  totalSessionCost: number;
  successfulOutcomes: number;
  costPerSuccess: number;
  byType: Record<string, { count: number; cost: number; costPerUnit: number }>;
}

class CostOutcomeTracker {
  getCostPerOutcome(sessionId: string): CostPerOutcome {
    const session = this.sessions.get(sessionId)!;
    const totalCost = session.calls.reduce((sum, c) => sum + c.cost, 0);
    const successCount = session.outcomes.filter(o => o.success).length;

    return {
      totalSessionCost: totalCost,
      successfulOutcomes: successCount,
      costPerSuccess: successCount > 0 ? totalCost / successCount : Infinity,
      byType: this.groupByType(session),
    };
  }
}
```

**实际意义**：如果 "生成一个代码审查" 成本是 $0.42，而 "修复审查发现的问题" 成本是 $0.18，那么让 Agent 修复比让人修复便宜——这个数字就是决策依据。

---

## 6. 月度对账与优化优先级

### 6.1 优化杠杆排序（ROI 从高到低）

| 优化手段 | 成本降幅 | 实施难度 | ROI |
|---|---|---|---|
| **Cache Hit 优化** | 30-40% | 低（加缓存头） | ★★★★★ |
| **缩短 Prompt** | 15-25% | 中（需测试） | ★★★★☆ |
| **切换更便宜的模型** | 10-60% | 中（需评估） | ★★★★☆ |
| **减少重试** | 10-20% | 中高（改善工具稳定性） | ★★★☆☆ |
| **Batch 调用** | 50%（适用场景有限） | 高 | ★★☆☆☆ |

### 6.2 月结对账清单

```
□ 网关汇总成本 vs 可观测性平台成本 vs Provider 账单 → 三者是否一致？
□ 成本最高的 10 个 Agent → 各占多少比例？
□ cache hit rate 趋势 → 上升还是下降？
□ 是否有未归属的成本（no tags）？
□ 模型分布是否合理（是否可以用 gpt-4o-mini 替代 gpt-4o 的场景）？
□ 单次对话平均成本趋势 → 是否在持续上升？
```

---

## 自己问自己的 3 个问题

### 1. 预算层级应该是"先到先得"还是"预留分配"？

当前实现是"先到先得"——谁的请求先到谁先用。这简单但不公平——一个 agent 可能用掉整个团队的预算。更好的做法是"预留+动态调整"：给每个 agent/user 预留最低配额，剩余预算池动态分配。但实现复杂度高很多。从简到繁的演进路径：先到先得 → 最小预留 → 动态资源池。

### 2. 成本漂移检测的多大偏差才算严重？

30% 是经验值——基于典型 Prompt 膨胀（500→650 tokens，约30%成本增长）。但不同场景阈值应该不同：高流量低价值场景（客服摘要）可以容忍 50%，低流量高价值场景（代码生成）10% 就该告警。更准确的做法是按场景设阈值。

### 3. Cache Hit Rate 是否应该成为 KPI？

应该。Cache hit rate 直接影响成本，而且是少数"优化了不影响质量"的指标。但需要注意：cache hit rate 高可能意味着 System Prompt 太长（被 cache 的内容多），也可能意味着用户问了太多重复问题。最佳实践：跟踪 cache hit rate 但结合"每次对话的平均新增 tokens"一起看。

---

## 参考资料

- Anthropic Prompt Caching Guide: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- OpenAI Token Usage: https://platform.openai.com/docs/guides/usage
- Atlan — Enterprise LLM Cost Management (2026): 10 practices for production cost governance
- CloudZero — AI Cost Intelligence Platform: cost-per-outcome framework
