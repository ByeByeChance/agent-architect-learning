# Agent 编排与协调

> 核心问题：Orchestrator 怎么把"帮我做一个 Todo App"分解成具体任务并分配给正确的 Agent？答案是 **任务分解（Task Decomposition）** + **Agent 路由（Agent Routing）** + **结果验证（Result Validation）**。

---

## 1. 任务分解：从模糊需求到可执行子任务

### 分解的四种粒度

```
用户：帮我审查这个 React 项目的安全性

Orchestrator 分解：
  Level 1 (粗): [审查安全性] → 1 个 Worker
  Level 2 (中): [审查 XSS] [审查注入] [审查敏感信息泄露] → 3 个 Worker
  Level 3 (细): [审查 XSS-组件A] [审查 XSS-组件B] ... → N 个 Worker
  Level 4 (过细): [审查 XSS-组件A-第3行] ... → 太多 Worker，认知负荷爆炸
```

**黄金法则：每个子任务应该是"一个 Worker 可以独立完成的、有明确验收标准的、预计 3-8 步推理链的"。**

### 分解策略

**(1) 按领域分解（Domain Decomposition）**

```typescript
// 输入：需要代码审查和测试
// 分解：
//   Worker A (代码审查专家) — System Prompt: 安全+性能+可维护性
//   Worker B (测试专家) — System Prompt: 单元测试+集成测试+边界情况
```

最常用的策略。每个 Worker 有独立的 System Prompt 和工具集。

**(2) 按步骤分解（Step Decomposition）**

```typescript
// 输入：从零实现一个功能
// 分解：
//   Step 1: 分析需求和设计 API
//   Step 2: 实现核心逻辑
//   Step 3: 添加错误处理
//   Step 4: 写测试
// 每一步的输出是下一步的输入（有依赖）
```

适合有清晰顺序的任务。依赖关系必须明确——Step 2 不能在没有 Step 1 输出的情况下开始。

**(3) 按视角分解（Perspective Decomposition）**

```typescript
// 输入：评估一个架构决策
// 分解：
//   Worker A: 从性能角度评估
//   Worker B: 从安全角度评估
//   Worker C: 从可维护性角度评估
//   Worker D: 从成本角度评估
// Synthesizer 汇总四个视角
```

适合需要多维度分析的任务。各视角独立，可以完全并行。

### 分解时 Orchestrator 的 Prompt 模板

```
你是一个任务分解专家。将用户的请求分解为可独立执行的子任务。

规则：
1. 每个子任务必须有明确的输入、输出和验收标准
2. 子任务之间标注依赖关系（哪些可以并行，哪些必须串行）
3. 每个子任务分配给一个 Agent 角色（代码专家/审查专家/测试专家/...）
4. 子任务数量不超过 5 个（超过则合并相似项）

用户请求：{userRequest}

输出 JSON 格式：
[
  {
    "id": "task-1",
    "description": "...",
    "agentRole": "code-generator",
    "dependsOn": [],
    "acceptanceCriteria": ["...", "..."]
  },
  ...
]
```

---

## 2. Agent 路由：把任务分配给正确的 Agent

### 三种路由策略

**(1) 角色匹配（Role-based Routing）——最常用**

```typescript
const AGENT_REGISTRY = {
  "code-generator": {
    systemPrompt: "你是 TypeScript + React 代码生成专家...",
    tools: ["write_file", "search_code"],
    capabilities: ["typescript", "react", "nodejs"],
  },
  "code-reviewer": {
    systemPrompt: "你是代码审查专家，专精安全和性能...",
    tools: ["read_file", "search_code"],
    capabilities: ["security", "performance", "typescript"],
  },
  "test-writer": {
    systemPrompt: "你是测试专家...",
    tools: ["write_file", "run_test"],
    capabilities: ["unit-test", "integration-test", "vitest"],
  },
};

function routeTask(task: Task): AgentConfig {
  // 1. 精确角色匹配
  if (task.agentRole && AGENT_REGISTRY[task.agentRole]) {
    return AGENT_REGISTRY[task.agentRole];
  }
  
  // 2. 能力匹配（语义搜索）
  const taskEmbedding = embed(task.description);
  return findClosestAgent(taskEmbedding, AGENT_REGISTRY);
}
```

**(2) 语义路由（Semantic Routing）**

当没有明确角色指定时，用 embedding 匹配任务描述和 Agent 能力描述：

```typescript
const taskVec = await embedder.encode(task.description);
const agentVecs = await Promise.all(
  Object.values(AGENT_REGISTRY).map(a =>
    embedder.encode(a.capabilities.join(" "))
  )
);
const bestMatch = argMax(cosineSimilarities(taskVec, agentVecs));
```

**(3) 动态路由（Dynamic Routing）**

Orchestrator 在工作过程中发现需要新的 Agent，动态创建：

```
Orchestrator 发现：审查结果中发现 SQL 注入风险
  → 需要专门的"安全审计 Agent"
  → 动态生成 System Prompt："你是 SQL 注入检测专家..."
  → 将该 Agent 加入注册表
```

### 路由的反模式

| 反模式 | 症状 | 后果 |
|---|---|---|
| **万能 Agent** | 所有任务都给同一个 Agent | 失去多 Agent 的意义 |
| **过度拆分** | 一个 3 步任务拆成 3 个 Agent | 通信开销 > 执行收益 |
| **角色模糊** | 两个 Agent 能力几乎重叠 | 任务可能被执行两次或都不执行 |
| **硬编码路由** | switch-case 匹配角色名 | 新角色需要改代码 |

---

## 3. Handoff：把对话控制权交给另一个 Agent

### 什么是 Handoff

Handoff 是多 Agent 系统中的关键机制——当当前 Agent 判断"这个问题更适合另一个 Agent 回答"时，主动把控制权转移。

```
用户 ──→ [通用助手 Agent]
              │
              │ "这个问题涉及安全性，我来转接给安全专家"
              │
              ▼
          [安全专家 Agent] ──→ 用户
              
和电话转接完全一样：
- 转接前：告知用户"我帮你转接到XX部门"
- 转接时：把之前的对话上下文传递给新 Agent
- 转接后：新 Agent 接手，用户无感知
```

### Handoff 的实现

```typescript
interface HandoffSignal {
  targetAgent: string;
  reason: string;         // 为什么转接（用户可见）
  context: {              // 传递给新 Agent 的上下文
    summary: string;      // 对话摘要
    relevantFacts: string[];
    userIntent: string;
  };
  returnOnComplete: boolean; // 完成后是否交还控制权
}

// Agent 判断是否需要 handoff
async function checkHandoff(
  currentAgent: AgentConfig,
  userMessage: string,
  conversationHistory: Message[]
): Promise<HandoffSignal | null> {
  const llm = createLLMClient();
  const result = await llm.chat([
    {
      role: "system",
      content: `你是 ${currentAgent.name}。
      可以处理的领域：${currentAgent.capabilities.join(", ")}。
      如果用户请求超出你的能力范围，返回 HANDOFF 信号。`
    },
    ...conversationHistory,
    { role: "user", content: userMessage }
  ]);
  
  if (result.content.includes("HANDOFF:")) {
    return parseHandoffSignal(result.content);
  }
  return null;
}
```

---

## 4. 任务状态管理

### 任务生命周期

```
                    ┌──────────┐
                    │  PENDING │  ← 已分解，等待依赖完成
                    └────┬─────┘
                         │ 依赖满足
                         ▼
                    ┌──────────┐
              ┌─────│ IN_PROGRESS │
              │     └─────┬──────┘
              │           │
       (重试)  │     ┌─────┼──────┐
              │     ▼     ▼      ▼
              │ ┌──────┐ ┌────┐ ┌──────┐
              └─│FAILED│ │DONE│ │STUCK │ ← 超时/无进展
                └──┬───┘ └──┬─┘ └──┬───┘
                   │        │      │
                   ▼        ▼      ▼
              上报给    汇总给   上报给
            Orchestrator Synthesizer Orchestrator
```

### 状态机实现

```typescript
class TaskStateMachine {
  private tasks: Map<string, TaskState> = new Map();
  
  transition(taskId: string, event: TaskEvent): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    
    const validTransitions: Record<TaskStatus, TaskEvent[]> = {
      PENDING: ["START"],
      IN_PROGRESS: ["COMPLETE", "FAIL", "TIMEOUT"],
      COMPLETED: [],
      FAILED: ["RETRY", "ESCALATE"],
    };
    
    if (!validTransitions[task.status].includes(event)) {
      throw new Error(
        `Invalid transition: ${task.status} → ${event}`
      );
    }
    
    task.status = this.nextStatus(task.status, event);
    task.updatedAt = Date.now();
  }
}
```

---

## 5. 自己问自己的 3 个问题

1. **任务分解到什么粒度算"刚好"？**
   答：一个子任务能被一个 Agent 在 3-8 步推理链内完成，且验收标准可以用规则（而非人工）判断。如果子任务还需要再分解，说明太粗；如果子任务的 System Prompt 只有一句话，说明太细。

2. **Handoff 会不会导致无限循环？**
   答：会。A 转给 B，B 转给 C，C 转回 A。解决方案：(1) Handoff 计数器——超过 3 次转接就停止，让当前 Agent 尽力回答；(2) 每次 Handoff 必须附带"为什么上一个 Agent 无法回答"，防止重复转接。

3. **任务状态机为什么要自己实现而不是用工作流引擎？**
   答：因为 Agent 任务的状态转换不是纯确定性的。一个任务"卡住了"（STUCK）的判断需要 LLM 分析输出内容——不是简单的超时就能判断。工作流引擎（Temporal/Cadence）适合确定性步骤，Agent 编排需要额外的智能判断层。

---

## 参考资料

- AutoGen AgentChat: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/
- "Task Decomposition for LLM Agents" (Khot et al., 2023)
- OpenAI Swarm (Handoff 参考实现): https://github.com/openai/swarm
