# Agent 生产部署与可观测性：从运行到可靠

> 核心问题：Agent 原型在 localhost 上跑通了，但放到生产环境中，挂了怎么办、慢了怎么办、出了事怎么查？答案是 **熔断 + 限流 + 健康检查 + 审计日志 + 金丝雀发布 + 可观测性追踪**——这六件武器让 Agent 从"能用"变成"可靠"。

---

## 1. 生产环境的独特挑战

### 1.1 原型 vs 生产的差距不是模型质量

| 维度 | 原型 | 生产 |
|---|---|---|
| **可用性** | 挂了重启就行 | 99.9% uptime SLA |
| **延迟** | 等 30 秒无所谓 | 用户期望 < 3 秒 |
| **成本** | 开发者的 API Key 无限刷 | 预算管死，超了要汇报 |
| **质量** | "看起来还不错" | 量化指标 + 回归测试 |
| **安全** | 信任输入 | 每一段输入都是潜在攻击 |
| **排障** | console.log 够了 | 需要 trace + log + metric 三位一体 |

### 1.2 Agent 特有的生产难题

- **非确定性**：同样输入不同输出，排障难
- **级联失败**：Orchestrator 依赖 LLM → LLM 依赖外部 API → 外部 API 挂了 → 全链路不可用
- **成本失控**：Agent 自动重试机制可能把一次失败的调用变成 10 次扣费
- **状态一致性**：长时间运行的 Agent 任务，中途挂掉是否可恢复？

---

## 2. 熔断器模式（Circuit Breaker）

### 2.1 为什么要熔断

当一个下游依赖（如 LLM API）开始失败或超时时，如果不加控制，每个请求仍然会尝试调用 → 堆积更多超时 → 耗尽线程池/连接池 → 整个系统不可用。**熔断器"快速失败"**——与其等 30 秒超时再失败，不如立即返回错误。

### 2.2 状态机

```
                  ┌──────────┐
         ┌─────── │  CLOSED  │ ◀────────────┐
         │        └────┬─────┘              │
         │    失败次数  │                    │
         │    达阈值    │                    │ (连续成功)
         │             ▼                    │
         │        ┌──────────┐     ┌───────┴──────┐
         └──────▶ │   OPEN   │ ──▶ │  HALF_OPEN   │
                  └──────────┘     └──────────────┘
                   拒绝所有请求   冷却后允许少量探测
                   (fail fast)    └─ 探测失败 → 回OPEN
```

### 2.3 实现

```typescript
type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;     // e.g., 5
  cooldownMs: number;           // e.g., 30000 (30s)
  halfOpenMaxRequests: number;  // e.g., 3
  timeoutMs: number;            // 单次请求超时
}

class CircuitBreaker<T> {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private lastStateChange = Date.now();

  async execute(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastStateChange > this.config.cooldownMs) {
        this.transitionTo("HALF_OPEN");
      } else {
        throw new CircuitOpenError("熔断器已打开");
      }
    }

    try {
      const result = await this.withTimeout(fn(), this.config.timeoutMs);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenMaxRequests) {
        this.transitionTo("CLOSED");
      }
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    if (this.state === "CLOSED") {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo("OPEN");
      }
    } else if (this.state === "HALF_OPEN") {
      this.transitionTo("OPEN"); // 探测失败，立即回 OPEN
    }
  }
}
```

### 2.4 Agent 场景中的熔断对象

| 熔断对象 | 阈值建议 | 理由 |
|---|---|---|
| LLM API (每个 Provider) | 3 次连续失败 | 不可用就是不可用，不用等 5 次 |
| 工具执行 (每个工具) | 5 次连续失败 | 工具失败可能只是参数问题 |
| 外部 API (每个依赖) | 5 次连续失败 | 外部服务更不稳定 |

---

## 3. 限流策略（Rate Limiting）

### 3.1 Token Bucket 算法

限流器像一个"令牌桶"——桶里有一定数量的令牌，每个请求需要消耗令牌。令牌以恒定速率补充。桶满时不再新增令牌。

```
桶容量 = 100 tokens
补充速率 = 10 tokens/秒

t=0s: 100 tokens → 请求消费 20 → 80 tokens
t=1s: 80+10 = 90 tokens
t=2s: 90+10 = 100 tokens (满了)
t=3s: 突发 50 → 100-50 = 50 tokens (允许，因为桶里够)
t=3s: 再突发 60 → 50 < 60 → 拒绝 (限流)
```

### 3.2 实现

```typescript
interface RateLimiterConfig {
  maxTokens: number;       // 桶容量
  refillRate: number;      // tokens/秒
}

class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  tryAcquire(requestedTokens: number = 1): RateLimiterResult {
    this.refill();

    if (this.tokens >= requestedTokens) {
      this.tokens -= requestedTokens;
      return { allowed: true, remainingTokens: this.tokens, retryAfterMs: 0, resetTime: 0 };
    }

    const tokensNeeded = requestedTokens - this.tokens;
    const retryAfterMs = (tokensNeeded / this.config.refillRate) * 1000;
    return { allowed: false, remainingTokens: this.tokens, retryAfterMs, resetTime: Date.now() + retryAfterMs };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.config.maxTokens, this.tokens + elapsed * this.config.refillRate);
    this.lastRefill = now;
  }
}
```

### 3.3 限流维度

| 维度 | 示例阈值 | 说明 |
|---|---|---|
| 全局请求数 | 100 req/s | 整个系统的吞吐量上限 |
| Per-User 请求数 | 10 req/s | 单用户保护 |
| Per-API-Key 请求数 | 50 req/s | 防止单个 Key 刷爆预算 |
| Token 消耗速率 | 100K tokens/min | 与请求数解耦的 token 维度限流 |
| Agent 步数/对话 | 最多 15 步 | 防止 Agent 陷入无限循环 |

---

## 4. 健康检查

### 4.1 Liveness vs Readiness

```typescript
interface HealthStatus {
  healthy: boolean;
  liveness: boolean;    // 进程是否存活？
  readiness: boolean;   // 能否接受新请求？
  checks: HealthCheckResult[];
  uptime: number;
}

interface HealthCheckResult {
  name: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}
```

- **Liveness**：进程是否还在运行。简单——只要 HTTP 服务器能返回 200 就行。
- **Readiness**：能否承担工作负载。复杂——需要检查 LLM API 连接、数据库连接、工具服务可用性、当前负载是否过高。

### 4.2 Agent 特有的健康指标

传统服务只关心 CPU/内存。Agent 服务还需要关心：

| 指标 | 意义 | 告警阈值 |
|---|---|---|
| LLM API 连接状态 | 核心依赖是否可达 | 不可达 → DEGRADED |
| 熔断器打开数量 | 多少下游依赖不可用 | > 1 个 OPEN → DEGRADED; > 3 → DOWN |
| 任务完成率 | 最近 1 小时的 Agent 成功率 | < 80% → DEGRADED |
| 平均响应延迟 | 用户体验的直接指标 | P99 > 30s → DEGRADED |
| 预算消耗速率 | 是否异常快 | 比正常快 2 倍 → WARNING |

---

## 5. 审计日志

### 5.1 为什么审计日志对 Agent 特别重要

Agent 的自主性意味着它可能在你不注意的时候做了事。审计日志是"事后追查"的唯一手段。**EU AI Act（2026 年 8 月强制执行）明确要求 AI 系统的输入/输出/决策过程可追溯。**

### 5.2 哈希链防篡改

简单的日志可以被篡改。哈希链保证：任何一条日志被修改，整个链都断裂。

```
Entry 1: SHA(Entry1_data) = hash1
Entry 2: SHA(Entry2_data + hash1) = hash2
Entry 3: SHA(Entry3_data + hash2) = hash3
...

验证: 按序重算，任一 hash 不匹配 → 链被篡改
```

### 5.3 实现

```typescript
interface AuditEntry {
  id: string;
  timestamp: number;        // UTC ISO 8601
  action: string;
  agentId: string;
  input_hash: string;       // SHA-256，不存原文
  output_hash: string;
  model: string;
  tokens: { prompt: number; completion: number };
  cost: number;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  previousEntryHash: string; // 链式防篡改
}

class AuditLogger {
  private entries: AuditEntry[] = [];

  log(entry: Omit<AuditEntry, "id" | "previousEntryHash">): AuditEntry {
    const previousHash = this.entries.length > 0
      ? this.entries[this.entries.length - 1].output_hash
      : "GENESIS";

    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const full: AuditEntry = { ...entry, id, previousEntryHash: previousHash };
    this.entries.push(full);
    return full;
  }

  verify(): { valid: boolean; brokenAt?: number } {
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].previousEntryHash !== this.entries[i - 1].output_hash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true };
  }
}
```

---

## 6. 金丝雀发布（Canary Release）

### 6.1 AI Agent 的金丝雀特有挑战

传统金丝雀：新版本部署到 5% 流量 → 看错误率 → 推广。

AI Agent 金丝雀：新 Prompt/模型部署到 5% 流量 → 看**行为质量**（不只是错误率）→ 推广。

### 6.2 金丝雀流程

```
Step 1: 5%  流量 → 运行 2h → 对比基线（任务完成率、成本、延迟、信任评分）
Step 2: 25% 流量 → 运行 4h → 同上
Step 3: 50% 流量 → 运行 8h → 同上
Step 4: 100%     → 金丝雀模型成为新的稳定模型
```

### 6.3 自动回滚条件

```typescript
interface CanaryConfig {
  stableModel: ModelConfig;
  canaryModel: ModelConfig;
  canaryPercent: number;
  rollbackConditions: {
    maxErrorRateIncrease: number;     // 如 0.02 (2%)
    maxCostIncrease: number;          // 如 0.15 (15%)
    maxLatencyP99Increase: number;    // 如 0.30 (30%)
    minQualityScoreDecrease: number;  // 如 0.05 (5%)
  };
}
```

**关键回滚触发器**：
- 任务完成率下降 > 2% → 立即回滚
- 成本增加 > 15% → 立即回滚（新模型再强也不能超预算）
- P99 延迟增加 > 30% → 立即回滚（用户体验受损）
- 信任评分下降 > 5% → 暂停推广，人工评估

---

## 7. 可观测性追踪

### 7.1 三层可观测性

```
Logs     — 离散事件记录（"Agent X 在 14:32 调用了工具 Y"）
Metrics  — 聚合时间序列（"过去 5 分钟的平均延迟是 2.3s"）
Traces   — 端到端请求链路（"用户请求 → Orchestrator → CodeGen LLM → 审查 LLM → 回复"）
```

### 7.2 Agent Trace Span 层次

```
Request Span (用户请求)
  ├── Orchestrator Span
  │   ├── LLM Inference Span (任务分解) → tokens, latency, cost
  │   └── ...
  ├── Worker Span (Code Generation)
  │   ├── LLM Inference Span → tokens, latency, cost
  │   ├── Tool Call Span (读取文件)
  │   └── Tool Call Span (写入文件)
  ├── Worker Span (Code Review)
  │   └── LLM Inference Span → tokens, latency, cost
  └── Synthesizer Span
      └── LLM Inference Span → tokens, latency, cost
```

---

## 8. 多模型降级链

### 8.1 降级策略

```
Try 1: Claude 3.5 Sonnet (primary)
  ├── 超时 (>10s)      → Try 2
  ├── Rate Limit (429) → Try 2
  ├── Error (5xx)      → Try 2
  └── Success          → Done!

Try 2: GPT-4o (secondary)
  ├── 超时 (>10s)      → Try 3
  ├── Rate Limit (429) → Try 3
  ├── Error (5xx)      → Try 3
  └── Success          → Done!

Try 3: DeepSeek-V3 (tertiary)
  ├── 失败             → Return error to user
  └── Success          → Done! (但标记 degraded)
```

### 8.2 成本感知的降级

```typescript
const FALLBACK_CHAIN: ModelConfig[] = [
  { name: "Claude-3.5-Sonnet", priority: 1, costMultiplier: 1.0 },
  { name: "GPT-4o", priority: 2, costMultiplier: 0.85 },
  { name: "GPT-4o-mini", priority: 3, costMultiplier: 0.1 },
];
```

降级不仅考虑可用性，也考虑成本——降级后的成本可能更低。

---

## 9. 优雅关闭

### 9.1 Agent 特有的关闭挑战

Agent 任务可能是长时间运行的（几分钟到几十分钟）。直接 `kill -9` 会导致：
- 正在执行的 LLM 调用丢失
- 任务状态不完整
- 审计日志缺失

### 9.2 关闭流程

```typescript
interface ShutdownConfig {
  drainTimeoutMs: number;       // 等待已有任务完成的最大时间
  forceExitTimeoutMs: number;   // 超时后强制退出
}

class GracefulShutdown {
  private inFlight = 0;
  private shuttingDown = false;

  async start(): Promise<void> {
    const cleanup = async () => {
      this.shuttingDown = true;
      console.log(`🛑 收到关闭信号，等待 ${this.inFlight} 个进行中任务完成...`);

      // 1. 等待进行中任务排空
      const start = Date.now();
      while (this.inFlight > 0 && Date.now() - start < this.config.drainTimeoutMs) {
        await sleep(100);
      }

      // 2. 执行清理回调
      for (const [name, fn] of this.cleanupHandlers) {
        await fn();
      }

      process.exit(0);
    };

    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
  }
}
```

---

## 自己问自己的 3 个问题

### 1. 熔断器的 OPEN→HALF_OPEN 过渡时间怎么定？

30 秒是常见默认值——既不会频繁开关导致状态颠簸，也不会让服务长时间不可用。但对于不同的依赖，理想时间不同：LLM API 可能 10 秒就够了（因为通常只是短暂限流），而工具执行可能需要 60 秒（工具可能正在部署修复）。更好的做法是根据依赖的恢复特性设置不同的 cooldown。

### 2. 金丝雀发布需要多少流量才有统计意义？

5% 流量在 2 小时内通常能积累 100+ 次 Agent 调用，足以检测到 5% 以上的质量偏差。但如果 Agent 流量很低（< 20 次/小时），金丝雀可能需要运行 12-24 小时才有信度。低流量场景更适合用 A/B 回放测试（用历史流量重放对比）替代实时金丝雀。

### 3. 审计日志的哈希链和区块链有什么区别？

审计日志的哈希链是一条单向的、只追加的、单点维护的链。区块链是多方维护的分布式共识链。审计场景不需要分布式共识——只需要保证"没有人能事后偷偷修改日志"。哈希链足够满足这个需求，而且完全没有区块链的性能开销。

---

## 参考资料

- Release It! (2nd Edition) — Michael Nygard: Circuit Breaker pattern bible
- Martin Fowler — Circuit Breaker: https://martinfowler.com/bliki/CircuitBreaker.html
- Google SRE Book — Health Checks & Graceful Shutdown
- OpenTelemetry: https://opentelemetry.io/
- EU AI Act — Article 12 (Record-keeping): Audit log requirements
- LangFuse — Open-source LLM observability: https://langfuse.com/
- Dynatrace Pulse of Agentic AI 2026: Production deployment barriers survey
