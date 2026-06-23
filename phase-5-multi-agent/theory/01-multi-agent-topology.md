# 多 Agent 拓扑模式

> 核心问题：单个 Agent 能做的事有限——一个 Agent 负责代码审查，一个负责写代码，一个负责测试。怎么组织它们？答案是 **Agent 拓扑**——定义 Agent 之间的结构关系和通信路径。

---

## 1. 为什么需要多 Agent？

### 单 Agent 的硬天花板

```
单 Agent：
  用户 → [Agent] → 工具调用 → 回答
  
  问题：
  - 一个 System Prompt 无法同时胜任"代码审查+代码生成+测试设计"
  - 工具太多（50+），LLM 选工具出错率随工具数指数上升
  - 单次推理链太长（>20步）导致"Lost in the Middle"
  - 一个 Agent 崩了 = 整个任务失败

多 Agent：
  用户 → [Orchestrator] → [Agent A: 分析需求]
                        → [Agent B: 写代码]
                        → [Agent C: 审查代码]
                        → [Agent D: 写测试]
                        → [Orchestrator 汇总] → 回答
```

**核心洞察**：多 Agent 不是"多调用几次 LLM"，而是**给每个 LLM 调用一个明确的、狭窄的角色和工具集**。这降低了每次调用的认知负荷，提升了每步的成功率。

### 单 Agent vs 多 Agent 决策框架

| 场景 | 推荐方案 | 原因 |
|---|---|---|
| 简单问答 | 单 Agent | 多 Agent 增加延迟，无收益 |
| 单一领域任务（如只写代码） | 单 Agent + 强 System Prompt | 角色不需要切换 |
| 跨领域任务（写+审+测） | 多 Agent | 不同领域需要不同 System Prompt |
| 有依赖步骤（先分析再实现） | 多 Agent with Orchestrator | 步骤间需要状态传递 |
| 需要人类审批 | 多 Agent + HITL Gate | 审批点天然是 Agent 边界 |
| 实时交互 | 单 Agent | 多 Agent 延迟叠加 |

**原则：能用单 Agent 解决的不要用多 Agent。多 Agent 只在任务天然有"角色边界"时才值得引入。**

---

## 2. 四种拓扑模式

### 模式 1：Orchestrator / Worker（编排式）

```
              ┌──────────────┐
              │ Orchestrator │  ← 大脑：分解任务、分配、汇总
              └──┬───┬───┬──┘
                 │   │   │
        ┌────────┘   │   └────────┐
        ▼            ▼            ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Worker A│ │ Worker B│ │ Worker C│  ← 手：执行具体任务
   └─────────┘ └─────────┘ └─────────┘
```

这是**90% 的多 Agent 场景的正解**。

**工作流程**：
1. Orchestrator 分析用户输入，分解为子任务
2. 每个子任务分派给对应 Worker（可能有依赖关系）
3. Worker 返回结果，Orchestrator 验证
4. 如果不符合预期，Orchestrator 重新分派或修正
5. Orchestrator 汇总所有 Worker 结果，生成最终输出

**优点**：结构清晰，易于 debug，HITL 审批天然嵌入 Orchestrator 层。
**缺点**：Orchestrator 是单点瓶颈——它崩了整个系统崩。
**适用场景**：任务有清晰的主次结构、需要人类审批、流程固定。

### 模式 2：Peer-to-Peer（对等式）

```
   ┌─────────┐      ┌─────────┐
   │ Agent A │◄────►│ Agent B │
   └────┬─────┘      └────┬─────┘
        │                 │
        └────────┬────────┘
                 ▼
           ┌─────────┐
           │ Agent C │
           └─────────┘
```

没有中心 Orchestrator，Agent 之间直接通信和协商。

**适用场景**：去中心化决策（如模拟市场、辩论、多方博弈），学术研究多于工程实践。

**为什么 P2P 在工程中少见？**
- Debug 困难：谁该为错误负责？A 说 B 的信息错了，B 说 A 理解错了
- 收敛不确定：对话可能无限循环，没有"谁来拍板"的机制
- 工程中大多数任务天然有层级结构，不需要 P2P

### 模式 3：Hierarchical（层级式）

```
              ┌────────────┐
              │  CEO Agent │  ← 战略决策
              └─────┬──────┘
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ TL Agent│ │ TL Agent│ │ TL Agent│  ← 战术协调
   └────┬────┘ └────┬────┘ └────┬────┘
    ┌───┼───┐   ┌───┼───┐   ┌───┼───┐
    ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼
   [W] [W] [W] [W] [W] [W] [W] [W] [W]  ← 执行
```

**和三层的区别**：不是简单的三层，而是**每层有自己的决策自主权**。TL Agent 可以决定如何分配子任务给 Worker，不需请示 CEO Agent。

**优点**：可扩展，适合超复杂任务（10+ Agent）。
**缺点**：延迟叠加（每层都增加 LLM 调用），信息传递可能失真。
**适用场景**：大型代码库重构、多系统集成、复杂工作流。

### 模式 4：混合模式（生产环境推荐）

```
              ┌──────────────┐
              │ Orchestrator │  ← 中心协调 + HITL Gate
              └──┬───┬───┬──┘
                 │   │   │
        ┌────────┘   │   └────────┐
        ▼            ▼            ▼
   ┌─────────┐ ┌─────────┐   (需要时)
   │ Worker A│ │ Worker B│      │
   └────┬────┘ └─────────┘      ▼
        │                 ┌──────────────┐
        ▼                 │ 子Orchestrator│ ← 复杂子任务再用编排
   ┌─────────┐            └──┬───┬───┬──┘
   │ Worker  │               │   │   │
   └─────────┘              [W] [W] [W]
```

**核心原则**：顶层用 Orchestrator 模式，子任务简单则直接用 Worker，子任务复杂则再嵌套一个子 Orchestrator。

这是 AutoGen 和 CrewAI 默认推荐的模式，也是我们实践模块的实现目标。

---

## 3. Agent 间通信

### 通信内容

Agent 之间传递的不是自然语言闲聊，而是**结构化消息**：

```typescript
interface AgentMessage {
  from: string;           // 发送方 Agent ID
  to: string;             // 接收方 Agent ID
  type: "task" | "result" | "query" | "handoff" | "error";
  
  // 任务/结果
  task?: {
    description: string;
    context: Record<string, any>;  // 结构化的上下文，不是自由文本
    expectedOutput: string;        // 期望输出格式
  };
  result?: {
    content: any;
    confidence: number;   // 0-1，Agent 对自己输出的信心
    artifacts: string[];  // 文件、代码等产出物引用
  };
  
  // 元数据
  traceId: string;        // 全链路追踪
  timestamp: number;
  ttl: number;            // 超时时间（ms），防止无限等待
}
```

**为什么结构化而非自然语言？**
1. 可解析：Orchestrator 可以程序化地判断结果是否符合预期
2. 可追踪：traceId 串联整个链路
3. 可超时：ttl 防止"Agent B 卡住了，Agent A 无限等待"

### 通信模式

| 模式 | 描述 | 类比 | 适用场景 |
|---|---|---|---|
| **Request-Reply** | A 发给 B，B 返回结果 | HTTP | 任务分派 |
| **Publish-Subscribe** | A 广播，多个 B 接收 | Event Bus | 状态变更通知 |
| **Handoff** | A 把对话控制权转给 B | 电话转接 | 用户直接和不同 Agent 对话 |
| **Consensus** | 多个 Agent 各自出结果，投票 | 陪审团 | 高风险决策 |

---

## 4. Agent 角色定义

从 agent-fleet 的 118 个角色中，多 Agent 系统最常见的几种：

| 角色 | 职责 | System Prompt 特征 |
|---|---|---|
| **Orchestrator** | 任务分解、分配、汇总 | 元认知强、不执行具体任务 |
| **Worker** | 执行单一领域任务 | 领域 expert、工具明确 |
| **Critic** | 审查其他 Agent 的输出 | 找问题、挑毛病、验证正确性 |
| **Synthesizer** | 汇总多个 Agent 的输出 | 去重、合并、统一风格 |
| **HITL Gate** | 判断是否需要人类审批 | 风险评估、边界检测 |

---

## 5. 自己问自己的 3 个问题

1. **为什么不多 Agent 并行所有任务？**
   答：并行只在任务无依赖时有效。大多数任务有依赖链——先分析需求才能写代码，先写代码才能审查。强行并行只会产生错误结果。另外并行意味着多个 LLM 同时调用，API 成本和延迟也成倍增加。

2. **Agent 数量有没有上限？**
   答：有，遵循"2 个披萨原则"——如果一个 Orchestrator 管理的 Worker 超过 5-7 个，它自己的认知负荷就太高了，任务分解质量会下降。超过这个数量，应该引入 Hierarchical 模式。

3. **Orchestrator 崩了怎么办？**
   答：这是 Orchestrator 模式的单点故障问题。解决方案：(1) 任务状态持久化（崩了可以从断点恢复），(2) 子 Orchestrator 有各自的 fallback 机制，(3) 最坏情况下退化为单 Agent 模式直接回答。

---

## 参考资料

- AutoGen (Microsoft): https://github.com/microsoft/autogen — 多 Agent 对话框架
- CrewAI: https://github.com/crewAIInc/crewAI — 角色化 Agent 编排
- "Multi-Agent Systems: A Survey" (Dorri et al., 2018)
- Anthropic SWE-bench 多 Agent 实践: https://www.anthropic.com/research/swe-bench
