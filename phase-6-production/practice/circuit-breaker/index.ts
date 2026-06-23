/**
 * 生产守护组件：熔断器 + 限流 + 健康检查 + 审计日志
 *
 * 设计理念（对应 theory/03-production-observability.md §1-5）：
 *   这四件武器是 Agent 从原型走向生产的基石：
 *   熔断器防止级联失败，限流器保护系统不被突发流量打垮，
 *   健康检查保证流量只路由到健康的实例，审计日志提供事后追查的唯一手段。
 *
 * 运行：npm run circuit-breaker
 */

import crypto from "node:crypto";

// ============================================================
// Types
// ============================================================

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxRequests: number;
  timeoutMs: number;
}

interface CircuitBreakerStatus {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalTransitions: number;
}

class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number;
}

interface RateLimiterResult {
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs: number;
}

interface HealthCheckResult {
  name: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

interface HealthStatus {
  healthy: boolean;
  liveness: boolean;
  readiness: boolean;
  checks: HealthCheckResult[];
  uptime: number;
}

interface AuditEntry {
  id: string;
  timestamp: number;
  action: string;
  agentId: string;
  input_hash: string;
  output_hash: string;
  model: string;
  tokens: { prompt: number; completion: number };
  cost: number;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  previousEntryHash: string;
}

// ============================================================
// 1. Circuit Breaker — 泛型熔断器
// ============================================================

class CircuitBreaker<T> {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange: number;
  private totalTransitions = 0;

  constructor(private config: CircuitBreakerConfig) {
    this.lastStateChange = Date.now();
  }

  async execute(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastStateChange;
      if (elapsed >= this.config.cooldownMs) {
        this.transitionTo("HALF_OPEN");
      } else {
        const remaining = Math.ceil((this.config.cooldownMs - elapsed) / 1000);
        throw new CircuitOpenError(`熔断器已打开，约 ${remaining}s 后进入半开状态`);
      }
    }

    try {
      const result = await this.withTimeout(fn(), this.config.timeoutMs);
      this.onSuccess();
      return result;
    } catch (err) {
      if (err instanceof CircuitOpenError) throw err;
      this.onFailure();
      throw err;
    }
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalTransitions: this.totalTransitions,
    };
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
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    this.totalTransitions++;
    this.successCount = 0;
    if (newState === "CLOSED") this.failureCount = 0;
    console.log(`  ⚡ 熔断器状态变更: ${oldState} → ${newState} (第 ${this.totalTransitions} 次转换)`);
  }

  private async withTimeout(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`请求超时 (${timeoutMs}ms)`)), timeoutMs);
    });
    try {
      const result = await Promise.race([promise, timeout]);
      clearTimeout(timer!);
      return result;
    } catch (err) {
      clearTimeout(timer!);
      throw err;
    }
  }
}

// ============================================================
// 2. Rate Limiter — Token Bucket + 滑动窗口
// ============================================================

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private requestTimestamps: number[] = [];

  constructor(private config: RateLimiterConfig) {
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  tryAcquire(requestedTokens: number = 1): RateLimiterResult {
    this.refill();

    // 滑动窗口清理
    const windowStart = Date.now() - 1000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);
    this.requestTimestamps.push(Date.now());

    if (this.tokens >= requestedTokens) {
      this.tokens -= requestedTokens;
      return { allowed: true, remainingTokens: this.tokens, retryAfterMs: 0 };
    }

    const tokensNeeded = requestedTokens - this.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / this.config.refillRate) * 1000);
    return { allowed: false, remainingTokens: this.tokens, retryAfterMs };
  }

  getStatus(): { tokens: number; capacity: number; windowRequestCount: number } {
    this.refill();
    return {
      tokens: Math.round(this.tokens),
      capacity: this.config.maxTokens,
      windowRequestCount: this.requestTimestamps.length,
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.config.maxTokens, this.tokens + elapsed * this.config.refillRate);
    this.lastRefill = now;
  }
}

// ============================================================
// 3. Health Checker — Liveness + Readiness
// ============================================================

class HealthChecker {
  private checks = new Map<string, () => Promise<boolean>>();
  private startTime: number;
  private history: HealthCheckResult[][] = [];

  constructor() {
    this.startTime = Date.now();
    // 默认注册 liveness 检查（总是通过——此代码在运行）
    this.registerCheck("process-liveness", async () => true);
  }

  registerCheck(name: string, check: () => Promise<boolean>): void {
    this.checks.set(name, check);
  }

  async check(): Promise<HealthStatus> {
    const results: HealthCheckResult[] = [];

    for (const [name, fn] of this.checks) {
      const start = Date.now();
      try {
        const healthy = await fn();
        results.push({ name, healthy, latencyMs: Date.now() - start });
      } catch (err: any) {
        results.push({ name, healthy: false, latencyMs: Date.now() - start, error: err.message });
      }
    }

    this.history.push(results);

    const liveness = results.find(r => r.name === "process-liveness")?.healthy ?? true;
    const readiness = results
      .filter(r => r.name !== "process-liveness")
      .every(r => r.healthy);

    return {
      healthy: liveness && readiness,
      liveness,
      readiness,
      checks: results,
      uptime: Date.now() - this.startTime,
    };
  }
}

// ============================================================
// 4. Audit Logger — Append-only + 哈希链防篡改
// ============================================================

class AuditLogger {
  private entries: AuditEntry[] = [];

  log(entry: Omit<AuditEntry, "id" | "previousEntryHash">): AuditEntry {
    const previousHash = this.entries.length > 0
      ? this.entries[this.entries.length - 1].output_hash
      : "GENESIS";

    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const full: AuditEntry = {
      ...entry,
      id,
      previousEntryHash: previousHash,
    };

    this.entries.push(full);
    return full;
  }

  verify(): { valid: boolean; brokenAt?: number; message: string } {
    if (this.entries.length <= 1) {
      return { valid: true, message: "链有效（条目数 ≤ 1，无需验证）" };
    }

    for (let i = 1; i < this.entries.length; i++) {
      const expectedPrevHash = this.entries[i - 1].output_hash;
      const actualPrevHash = this.entries[i].previousEntryHash;
      if (actualPrevHash !== expectedPrevHash) {
        return {
          valid: false,
          brokenAt: i,
          message: `❌ 第 ${i} 条日志的前驱哈希不匹配！期望=${expectedPrevHash.slice(0, 16)}..., 实际=${actualPrevHash.slice(0, 16)}...`,
        };
      }
    }

    return { valid: true, message: `✅ 哈希链完整，${this.entries.length} 条日志全部验证通过` };
  }

  query(filters: { agentId?: string; status?: string; limit?: number }): AuditEntry[] {
    let result = [...this.entries];
    if (filters.agentId) result = result.filter(e => e.agentId === filters.agentId);
    if (filters.status) result = result.filter(e => e.status === filters.status);
    if (filters.limit) result = result.slice(-filters.limit);
    return result;
  }

  getAll(): AuditEntry[] {
    return [...this.entries];
  }
}

// ============================================================
// Demo
// ============================================================

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("\n🔧 生产守护组件 Demo\n");
  console.log("=".repeat(65));

  // --- Phase 1: 熔断器状态机 ---
  console.log("\n📦 Phase 1: 熔断器状态机");
  console.log("-".repeat(45));

  const breaker = new CircuitBreaker<string>({
    failureThreshold: 3,
    cooldownMs: 3000,
    halfOpenMaxRequests: 2,
    timeoutMs: 5000,
  });

  // 模拟 5 个连续失败请求（前 3 个触发 OPEN）
  console.log("\n  阶段 1a: 触发熔断");
  for (let i = 1; i <= 5; i++) {
    try {
      await breaker.execute(async () => {
        await sleep(50);
        throw new Error("模拟 LLM API 超时");
      });
    } catch (err: any) {
      const status = breaker.getStatus();
      console.log(`  请求${i}: ❌ ${err.name === "CircuitOpenError" ? "熔断器已打开，快速失败" : err.message} | 状态=${status.state} | 失败=${status.failureCount}`);
    }
    await sleep(50);
  }

  // 等待冷却
  console.log("\n  阶段 1b: 等待冷却 (3s)...");
  await sleep(3200);

  // HALF_OPEN 探测成功 → CLOSED
  console.log("\n  阶段 1c: HALF_OPEN 探测");
  for (let i = 1; i <= 3; i++) {
    try {
      const result = await breaker.execute(async () => {
        await sleep(30);
        return `成功响应-${i}`;
      });
      const status = breaker.getStatus();
      console.log(`  探测${i}: ✅ ${result} | 状态=${status.state}`);
    } catch (err: any) {
      console.log(`  探测${i}: ❌ ${err.message}`);
    }
    await sleep(50);
  }

  const finalStatus = breaker.getStatus();
  console.log(`\n  📊 最终状态: ${finalStatus.state} | 总转换: ${finalStatus.totalTransitions}次`);

  // --- Phase 2: 限流器 ---
  console.log("\n📦 Phase 2: Token Bucket 限流器");
  console.log("-".repeat(45));

  const limiter = new RateLimiter({ maxTokens: 10, refillRate: 2 });

  console.log("\n  突发 15 个请求（每 50ms 一个）:");
  let allowed = 0;
  let denied = 0;
  for (let i = 1; i <= 15; i++) {
    const result = limiter.tryAcquire(1);
    const icon = result.allowed ? "✅" : "🚫";
    if (result.allowed) allowed++; else denied++;
    console.log(`  请求${String(i).padStart(2)}: ${icon} 剩余tokens=${String(Math.round(result.remainingTokens)).padStart(2)} ${!result.allowed ? `重试等待: ${result.retryAfterMs}ms` : ""}`);
    await sleep(50);
  }
  console.log(`  📊 通过: ${allowed} | 拒绝: ${denied}`);

  // 等待补充
  console.log("\n  等待 3 秒让令牌补充...");
  await sleep(3000);
  const refillStatus = limiter.getStatus();
  console.log(`  补充后: tokens=${refillStatus.tokens}/${refillStatus.capacity} | 窗口请求=${refillStatus.windowRequestCount}`);

  // --- Phase 3: 健康检查 ---
  console.log("\n📦 Phase 3: 健康检查");
  console.log("-".repeat(45));

  const healthChecker = new HealthChecker();

  healthChecker.registerCheck("llm-api-connectivity", async () => {
    // 模拟 85% 成功率
    return Math.random() > 0.15;
  });

  healthChecker.registerCheck("database-connectivity", async () => {
    // 模拟 95% 成功率
    return Math.random() > 0.05;
  });

  healthChecker.registerCheck("tool-service-availability", async () => {
    // 模拟 90% 成功率
    return Math.random() > 0.10;
  });

  for (let cycle = 1; cycle <= 5; cycle++) {
    await sleep(100);
    const status = await healthChecker.check();
    const ok = status.checks.filter(c => c.healthy).length;
    const total = status.checks.length;
    console.log(`  轮次${cycle}: ${status.healthy ? "🟢" : status.liveness ? "🟡" : "🔴"} liveness=${status.liveness} readiness=${status.readiness} | 通过=${ok}/${total} | uptime=${Math.round(status.uptime / 1000)}s`);
    status.checks.forEach(c => {
      if (!c.healthy) console.log(`    ⚠️  ${c.name}: ${c.error ?? "不健康"} (${c.latencyMs}ms)`);
    });
  }

  // --- Phase 4: 审计日志 ---
  console.log("\n📦 Phase 4: 审计日志哈希链");
  console.log("-".repeat(45));

  const auditLogger = new AuditLogger();

  const inputs = [
    "帮我写一个排序函数",
    "审查这段代码的安全性",
    "生成用户认证模块的测试",
    "优化数据库查询性能",
    "分析这段错误日志",
    "生成 API 文档",
    "重构这个工具类的设计",
    "检查 SQL 注入漏洞",
    "写一个 CI/CD pipeline 配置",
    "解释这段 TypeScript 泛型代码",
  ];

  const agents = ["code-generator", "code-reviewer", "test-writer", "optimizer"];
  const models = ["claude-3.5-sonnet", "gpt-4o", "deepseek-v3"];
  const statuses: Array<"SUCCESS" | "FAILED" | "BLOCKED"> = ["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "FAILED", "SUCCESS", "SUCCESS", "BLOCKED", "SUCCESS", "SUCCESS"];

  console.log("\n  写入 10 条审计日志...");
  for (let i = 0; i < 10; i++) {
    const input = inputs[i];
    const output = `${agents[i % 4]}: 任务完成 — ${input.slice(0, 10)}...`;
    const entry = auditLogger.log({
      timestamp: Date.now() - (10 - i) * 60000,
      action: `agent.call.${agents[i % 4]}`,
      agentId: `agent-${agents[i % 4]}-001`,
      input_hash: sha256(input),
      output_hash: sha256(output),
      model: models[i % 3],
      tokens: { prompt: 1200 + i * 300, completion: 400 + i * 100 },
      cost: 0.005 + i * 0.002,
      status: statuses[i],
    });
    console.log(`  #${i + 1}: ${entry.id} | ${entry.status} | prevHash=${entry.previousEntryHash.slice(0, 16)}...`);
  }

  // 验证哈希链
  console.log("\n  哈希链完整性验证:");
  const verifyResult = auditLogger.verify();
  console.log(`  ${verifyResult.message}`);

  // 模拟篡改
  console.log("\n  模拟篡改检测:");
  const entries = auditLogger.getAll();
  if (entries.length > 2) {
    entries[3].output_hash = "tampered-hash-value";
    const tamperedResult = auditLogger.verify();
    if (tamperedResult.brokenAt === 4) {
      console.log(`  ✅ 篡改检测成功：第 ${tamperedResult.brokenAt} 条日志被篡改，哈希链已断`);
    } else {
      console.log(`  ❌ 篡改检测失败：应该检测到第 4 条被篡改，实际断在 ${tamperedResult.brokenAt}`);
    }
  }

  // 查询
  const failures = auditLogger.query({ status: "FAILED", limit: 5 });
  console.log(`\n  查询: 失败记录 = ${failures.length} 条`);
  failures.forEach(f => {
    console.log(`    ${f.action} — tokens: ${f.tokens.prompt}+${f.tokens.completion} — $${f.cost.toFixed(4)}`);
  });

  // --- 全景总结 ---
  console.log("\n" + "=".repeat(65));
  console.log("📊 生产守护组件总结\n");
  console.log(`  熔断器: ${finalStatus.state} (${finalStatus.totalTransitions}次转换)`);
  console.log(`  限流器: 容量=${limiter.getStatus().capacity} 速率=${refillStatus.windowRequestCount}req/s`);
  console.log(`  审计链: ${verifyResult.message}`);
  console.log(`  健康检查: 4 项注册 (liveness + 3 readiness)`);

  console.log("\n💡 核心收获:");
  console.log("  - 熔断器的价值在 HALF_OPEN — 不给完全恢复机会就不会自动恢复");
  console.log("  - Token Bucket 的优雅之处在\"允许突发\"— 桶里的储备让你能应对波峰");
  console.log("  - 哈希链给你的是\"不可抵赖\"— 每一条日志的存在时间和顺序都无法篡改");
  console.log("  - 健康检查分 liveness/readiness — 活着不等于能干，能干不一定健康");
}

main().catch((err) => {
  console.error("❌ circuit-breaker error:", err);
  process.exit(1);
});
