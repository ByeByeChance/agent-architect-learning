# 失败恢复、HITL 与可观测性

> 核心问题：Agent 不是 100% 可靠的——它可能出错、超时、被卡住。多 Agent 系统中，一个 Agent 的失败如何恢复？什么时候需要人类介入？如何观测整个系统的运行状态？

---

## 1. Agent 失败模式分类

### 四种失败类型

| 失败类型 | 症状 | 根因 | 频次 |
|---|---|---|---|
| **功能失败** | 输出不符合验收标准 | Prompt 不够精确 / 模型能力不足 | 常见 |
| **超时失败** | 推理链太长，超过预算 | 任务太复杂 / 模型陷入循环 | 一般 |
| **幻觉失败** | 输出看起来对但实际错误 | 模型自信过度 / 检索结果不足 | 常见 |
| **系统失败** | API 报错 / 网络超时 | 基础设施问题 | 偶发 |

### 失败检测

```typescript
interface FailureDetector {
  // 规则检测：纯本地，确定性
  checkRules(result: AgentResult, criteria: AcceptanceCriteria): Failure[];
  
  // LLM 检测：语义判断"这个输出是否达到了预期"
  async checkSemantic(result: AgentResult, expected: string): Promise<Failure[]>;
  
  // 超时检测
  checkTimeout(task: Task, maxDuration: number): Failure | null;
}

// 规则检测示例
function checkRules(result: AgentResult, criteria: AcceptanceCriteria): Failure[] {
  const failures: Failure[] = [];
  
  // 1. 格式检查
  if (criteria.expectedFormat === "json") {
    try { JSON.parse(result.content); } catch {
      failures.push({ type: "FORMAT", severity: "HIGH", message: "输出不是合法 JSON" });
    }
  }
  
  // 2. 关键词检查
  if (criteria.mustInclude) {
    for (const kw of criteria.mustInclude) {
      if (!result.content.includes(kw)) {
        failures.push({ type: "CONTENT", severity: "MEDIUM", message: `缺少: ${kw}` });
      }
    }
  }
  
  // 3. 长度检查
  if (criteria.maxLength && result.content.length > criteria.maxLength) {
    failures.push({ type: "LENGTH", severity: "LOW", message: "输出超长" });
  }
  
  // 4. 置信度阈值
  if (result.confidence < (criteria.minConfidence || 0.7)) {
    failures.push({ type: "CONFIDENCE", severity: "MEDIUM", message: "置信度过低" });
  }
  
  return failures;
}
```

---

## 2. 失败恢复策略

### 策略 1：重试（Retry）——最基础

```typescript
async function retryWithFallback(
  task: Task,
  agent: AgentConfig,
  maxRetries: number = 2
): Promise<AgentResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await agent.execute(task);
      const failures = checkRules(result, task.acceptanceCriteria);
      
      if (failures.length === 0) return result;
      
      // ⚠️ 关键：重试时告诉 Agent 上次哪里失败了
      task.context.previousFailures = failures.map(f => f.message);
      task.context.attempt = attempt;
      
    } catch (err) {
      lastError = err as Error;
    }
  }
  
  throw new AgentFailureError(task.id, maxRetries, lastError);
}
```

**重试的核心不是"再试一次"，而是"告诉 Agent 上次哪里失败了，让它修正"。** 不加 failure feedback 的重试，Agent 大概率犯同样的错误。

### 策略 2：降级（Fallback）——换方案

```typescript
const FALLBACK_CHAIN: Record<string, string[]> = {
  "code-generator": ["code-generator-simple", "通用助手"],
  "code-reviewer": ["code-reviewer-fast", "通用助手"],
  "test-writer": ["test-writer-basic", "通用助手"],
};

async function executeWithFallback(
  task: Task,
  primaryAgent: string
): Promise<AgentResult> {
  const chain = [primaryAgent, ...(FALLBACK_CHAIN[primaryAgent] || [])];
  
  for (const agentName of chain) {
    const agent = AGENT_REGISTRY[agentName];
    if (!agent) continue;
    
    try {
      const result = await agent.execute(task);
      const failures = checkRules(result, task.acceptanceCriteria);
      
      if (failures.length === 0) {
        // 降级成功，记录事件
        if (agentName !== primaryAgent) {
          recordFallback(primaryAgent, agentName, task.id);
        }
        return result;
      }
    } catch (err) {
      continue; // 尝试下一个 fallback
    }
  }
  
  // 所有 fallback 都失败 → 上报给 HITL
  throw new AllFallbacksExhaustedError(task.id);
}
```

降级链设计原则：
- 主 Agent → 简化版 Agent（能力更弱但更可靠）→ 通用助手（兜底）
- 每一步降级都记录，便于分析"哪个 Agent 最常被绕过"
- 通用助手是最终兜底——它可能答得不够好，但至少不会系统崩溃

### 策略 3：隔离（Isolation）——防止级联崩溃

```typescript
// 每个 Agent 在自己的隔离上下文中运行
async function executeIsolated(
  agent: AgentConfig,
  task: Task
): Promise<AgentResult> {
  // 1. 独立的错误边界
  try {
    const result = await agent.execute(task);
    return result;
  } catch (err) {
    // 2. Agent 崩溃不影响其他 Agent
    return {
      content: "",
      confidence: 0,
      error: err.message,
      status: "FAILED",
    };
  }
}

// Orchestrator 层面处理隔离失败
async function orchestrate(tasks: Task[]): Promise<OrchestrationResult> {
  const results = await Promise.allSettled(
    tasks.map(t => executeIsolated(getAgent(t.agentRole), t))
  );
  
  // 统计失败率
  const failed = results.filter(r => r.status === "rejected" || r.value.status === "FAILED");
  
  if (failed.length / tasks.length > 0.5) {
    // 超过半数失败 → 整体任务可能需要重新设计
    throw new OrchestrationDegradedError(failed.length, tasks.length);
  }
  
  return synthesize(results);
}
```

**Promise.allSettled（而非 Promise.all）是关键**——它确保一个 Agent 崩溃不会让其他 Agent 的结果丢失。

---

## 3. Human-in-the-Loop (HITL)

### 什么时候需要人类

| 场景 | 触发条件 | HITL 动作 |
|---|---|---|
| **高风险操作** | 涉及删除/部署/支付 | 必须审批 |
| **低置信度** | Agent 信心 < 0.7 | 建议审批 |
| **矛盾结果** | 两个 Agent 结论相反 | 人类裁定 |
| **新领域** | 任务超出 Agent 训练范围 | 人类指导 |
| **合规要求** | 法律/安全/隐私相关 | 必须审批 |

### HITL Gate 实现

```typescript
interface HITLRequest {
  id: string;
  type: "APPROVAL" | "CHOICE" | "GUIDANCE";
  severity: "CRITICAL" | "WARNING" | "INFO";
  
  // 需要人类看的内容
  summary: string;          // "Agent 计划删除以下 3 个文件..."
  details: {
    agent: string;
    action: string;
    risk: string;           // "删除后将无法恢复"
    alternatives?: string[];
  };
  
  // 超时策略
  timeout: number;          // 300000 (5分钟)
  defaultAction: "APPROVE" | "REJECT" | "DEFER";
  
  // 回调
  onApproved: () => Promise<void>;
  onRejected: () => Promise<void>;
  onTimeout: () => Promise<void>;
}

class HITLManager {
  private pendingRequests: Map<string, HITLRequest> = new Map();
  
  async requestApproval(request: HITLRequest): Promise<"APPROVED" | "REJECTED" | "TIMEOUT"> {
    this.pendingRequests.set(request.id, request);
    
    // 1. 通知用户（WebSocket/Notification）
    this.notifyUser(request);
    
    // 2. 等待用户响应或超时
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        request.onTimeout();
        resolve("TIMEOUT");
      }, request.timeout);
      
      // 存储 resolve 以便用户响应时调用
      this.resolvers.set(request.id, { resolve, timer });
    });
  }
  
  async userRespond(id: string, decision: "APPROVED" | "REJECTED"): Promise<void> {
    const resolver = this.resolvers.get(id);
    if (!resolver) throw new Error(`Unknown request: ${id}`);
    
    clearTimeout(resolver.timer);
    resolver.resolve(decision);
    this.resolvers.delete(id);
    
    const request = this.pendingRequests.get(id);
    if (decision === "APPROVED") await request?.onApproved();
    else await request?.onRejected();
  }
}
```

### HITL 的设计原则

1. **必须有默认超时行为**：用户可能不在，系统不能无限等待。`defaultAction` 定义了超时后的行为。
2. **审批信息必须简洁**：用户不会读 2000 字的分析报告。`summary` 不超过 3 句话。
3. **提供选项而非开放问题**："选 A 还是 B？"比"你觉得怎么办？"好得多。
4. **记录所有审批决策**：便于事后审计和模型改进。

---

## 4. 可观测性

### 多 Agent 系统的观测挑战

单 Agent：一次 API 调用 → 一个结果。多 Agent：N 次 API 调用 → N 个中间结果 → 1 个最终结果。你需要看到中间发生了什么。

### 三大支柱

**(1) Tracing — 全链路追踪**

```typescript
interface Trace {
  traceId: string;
  userId: string;
  sessionId: string;
  
  // 任务树
  rootTask: TaskNode;
  
  // 时间线
  startTime: number;
  endTime?: number;
  
  // 统计
  totalAgentCalls: number;
  totalTokens: { input: number; output: number };
  estimatedCost: number;
  hitlApprovals: number;
}

interface TaskNode {
  taskId: string;
  agentRole: string;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  
  // 关键指标
  tokenUsage: { input: number; output: number };
  retries: number;
  fallbackUsed?: string;
  
  // 子树
  children: TaskNode[];
}
```

**(2) Metrics — 关键指标**

| 指标 | 计算方式 | 告警阈值 |
|---|---|---|
| **任务成功率** | 成功任务 / 总任务 | < 80% |
| **平均重试次数** | 总重试 / 总任务 | > 1.5 |
| **HITL 触发率** | 触发 HITL 的任务 / 总任务 | > 20% |
| **降级触发率** | 使用 fallback 的任务 / 总任务 | > 15% |
| **端到端延迟** | 用户请求 → 最终结果 | > 30s |
| **Token 效率** | 输出 token / 输入 token | < 0.1 |

**(3) Logging — 结构化日志**

```typescript
interface AgentLog {
  timestamp: number;
  traceId: string;
  agentRole: string;
  event: "TASK_START" | "TASK_COMPLETE" | "TASK_FAIL" | "HANDOFF" | "HITL_REQUEST" | "FALLBACK";
  data: Record<string, any>;
}
```

---

## 5. 上下文预算管理

### 多 Agent 的上下文挑战

单 Agent 只需管理自己的上下文。多 Agent 系统中，**每个 Agent 有自己的上下文预算，且 Orchestrator 有自己的上下文预算**。

```
总可用预算: 200K tokens
├── Orchestrator: 30K (分解任务 + 汇总结果)
├── Worker A: 40K (执行任务 A)
├── Worker B: 40K (执行任务 B)
├── Worker C: 40K (执行任务 C)
└── 剩余: 50K (弹性调度)
```

### 预算分配策略

```typescript
class ContextBudgetManager {
  constructor(private totalBudget: number) {}
  
  allocate(tasks: Task[]): Map<string, number> {
    const allocation = new Map<string, number>();
    
    // 1. Orchestrator 固定分配 15%
    allocation.set("orchestrator", Math.floor(this.totalBudget * 0.15));
    
    // 2. 按任务复杂度分配
    const remaining = this.totalBudget - allocation.get("orchestrator")!;
    const totalComplexity = tasks.reduce((s, t) => s + t.estimatedComplexity, 1);
    
    for (const task of tasks) {
      const share = Math.floor(
        (task.estimatedComplexity / totalComplexity) * remaining
      );
      allocation.set(task.id, Math.min(share, 50000)); // 单 Agent 上限 50K
    }
    
    return allocation;
  }
}
```

**核心原则**：Context 是有限的——不要让一个 Agent 用完所有预算，给 Orchestrator 留够空间做汇总和决策。

---

## 6. 自己问自己的 3 个问题

1. **为什么 Agent 重试要带 failure feedback？**
   答：因为 LLM 在没有反馈的情况下重试，大概率走同样的推理路径、犯同样的错误。failure feedback 本质是"缩小 Agent 的搜索空间"——"上次你在这里出错了，这次换个方式试试"。

2. **HITL 的 defaultAction 为什么很重要？**
   答：因为用户离线的概率比你想象的高。如果 defaultAction 设为 "APPROVE"，那就等于没有 HITL。如果设为 "REJECT"，那所有无人值守的任务都会失败。最佳实践是 DEFER——重新排队，等用户上线再处理。

3. **多 Agent 的可观测性比单 Agent 难在哪里？**
   答：关键区别是因果关系。单 Agent："答案错了"→ 查这一次调用的 prompt。多 Agent："答案错了"→ 可能是 Orchestrator 分解错了、Worker A 执行错了、或者 Synthesizer 汇总错了。Tracing 的树形结构就是为了回答"谁的锅"。

---

## 参考资料

- Anthropic Context Engineering: https://docs.anthropic.com/en/docs/build-with-claude/context-windows
- "Failure Modes in LLM-based Multi-Agent Systems" (Wu et al., 2024)
- OpenTelemetry for LLM: https://opentelemetry.io/
- AutoGen HITL 设计: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/human-in-the-loop/
