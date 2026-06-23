# Phase 6 源码走读

> 精读了 NVIDIA NeMo Guardrails（Colang DSL + Rail 架构）和 LangFuse（LLM 可观测性平台）两个生产级框架的核心设计。
> 重点关注它们如何解决 Agent 产品化的三个核心难题：安全护栏、成本追踪、可观测性。

---

## 1. NVIDIA NeMo Guardrails — 声明式安全护栏

**版本**: NeMo Guardrails v0.10+ | **源码**: Python | **许可证**: Apache 2.0

### 1.1 核心概念：Rails（轨道）

NeMo Guardrails 的核心隐喻是"铁轨"——Agent 的行为像火车，必须在轨道上运行。Rails 定义了 Agent 能做什么、不能做什么。

```
                        ┌──────────────────┐
  User Input ──────────▶│  Input Rails      │──▶ 检测 prompt 注入、越狱
                        └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Dialog Rails     │──▶ 控制对话流程、阻止不当话题
                        └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Retrieval Rails  │──▶ 检查检索到的文档是否相关/安全
                        └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Execution Rails  │──▶ 验证 tool call 参数是否安全
                        └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
  User ◀───────────────│  Output Rails     │──▶ 校验输出、脱敏、阻止危险内容
                        └──────────────────┘
```

**设计洞察**：五种 Rails 对应 Agent 交互的五个阶段。这不是"一个安全检查"，而是"五个检查点串联成安全链"。任何一个检查点可以决定 `allow`、`deny` 或 `modify`。

### 1.2 Colang DSL — 声明式安全语言

Colang 是 NeMo Guardrails 的领域特定语言，让安全规则用自然语言表达：

```colang
# 定义：用户不能讨论的话题
define bot refuse to respond to political questions
  "I'm sorry, I can't discuss political topics."

# 定义：输入检查
define flow
  user ...
  $allowed = execute input_rails
  if not $allowed
    bot refuse to respond
    stop

# 定义：输出检查
define flow
  ...
  bot $response
  $safe = execute output_rails
  if not $safe
    bot "I need to rephrase that."
```

**关键设计决策**：
1. **安全与业务分离**：安全工程师写 Colang，开发者写应用代码。两者通过 `execute input_rails` 这样的桥接点连接，互不干扰。
2. **声明式 > 命令式**：Colang 描述"什么该发生"而不是"怎么发生"，这让安全审计更直观——看 Colang 规则就知道系统被什么约束。
3. **Intent-based 匹配**：Colang 用 `user ...`（展开到 "user said something like..."）匹配用户意图而非精确字符串，比 regex 的覆盖率更高但更依赖 embedding 质量。

### 1.3 与我们 GuardrailPipeline 的对比

| 维度 | NeMo Guardrails | 我们的 GuardrailPipeline |
|---|---|---|
| **表达方式** | 声明式 DSL (Colang) | 命令式 TypeScript (class + method) |
| **安全逻辑位置** | 独立文件，安全团队可单独审查 | 嵌入在业务代码中 |
| **学习曲线** | 需要学 Colang 语法 | TypeScript 开发者零学习成本 |
| **灵活性** | 受 DSL 表达能力限制 | 完全编程能力，任意定制 |
| **审计友好度** | ⭐⭐⭐⭐⭐ 声明式规则一眼看懂 | ⭐⭐⭐ TypeScript 代码可读但需要开发能力 |
| **生产速度** | 慢（先写 Colang 规则再集成） | 快（直接在代码里加检查） |

**设计教训**：NeMo Guardrails 的"安全与业务分离"是最值得学习的点。我们的 `GuardrailPipeline` 虽然功能完整，但安全规则和业务逻辑在同一个代码文件中。**一个好的改进方向是将注入模式、PII 模式、安全规则提取为独立的 `.guard.json` 配置文件**，这样非开发人员也能审计安全策略。

### 1.4 源码亮点：Rail 的执行模型

NeMo Guardrails 的 rail 执行不是简单的"过一遍检查"——每个 rail 有三个可能的返回值：

```python
# 伪代码，展示核心模式
class RailResult:
    action: "allow" | "deny" | "modify"
    modified_output: Optional[str]
    reason: str
    confidence: float
```

- **allow**：安全通过
- **deny**：拦截（可配置拦截后的替代回复）
- **modify**：不拦截但修改内容（如脱敏 PII 后继续）

**modify 是我们缺少的关键操作**。我们的 GuardrailPipeline 只支持 allow/block 二元决策。在某些场景中（如 PII 检测），更好的做法不是拦截整个请求，而是**自动脱敏后继续**——用户看不到身份证号但能继续使用系统。

---

## 2. LangFuse — LLM 原生可观测性平台

**版本**: LangFuse v2.x | **源码**: TypeScript (SDK) + Python (SDK) + Web | **许可证**: MIT (核心 OSS)

### 2.1 核心数据模型：Trace → Observation

LangFuse 的核心抽象非常简洁——所有数据只有三种对象：

```
Trace (一次用户请求)
  ├── Observation (一次操作)
  │   ├── Generation (LLM 调用) — 包含 tokens、cost、model、prompt
  │   ├── Span (一般操作) — 如 HTTP 调用、数据库查询
  │   └── Event (点状事件) — 如 "用户点击了重试按钮"
  ├── Observation
  │   └── Generation
  └── Observation
      └── Span
```

**关键设计洞察**：Generation 是 Observation 的子类型——它不是通用 span，而是"LLM 调用"这一等公民。这很重要，因为 LLM 调用有 token 使用、成本、prompt、completion 这些专门属性，而通用 span 没有。

### 2.2 摄入架构

```
┌─────────┐    SDK.trace()    ┌─────────┐    HTTP POST    ┌──────────┐
│  App     │ ───────────────▶ │  SDK    │ ──────────────▶ │  API     │
│  Code    │    (同步, <1ms)  │ (Buffer)│   (异步批量)    │  Server  │
└─────────┘                   └─────────┘                 └──────────┘
                                                                │
                                                    ┌───────────┴───────────┐
                                                    │                       │
                                                    ▼                       ▼
                                              ┌───────────┐          ┌───────────┐
                                              │ PostgreSQL │          │ ClickHouse│
                                              │ (元数据)   │          │ (分析数据)│
                                              └───────────┘          └───────────┘
```

**源码亮点**：
1. **SDK 端 buffer**：SDK 在内存中缓存 trace 数据，每隔 N 条或每隔 T 秒批量 flush。这保证了 `langfuse.trace()` 调用本身 <1ms，不影响业务延迟。
2. **异步摄入**：API Server 接受数据后立即返回 200——然后异步写入队列。即使写入下游慢，也不影响 SDK 端的采集。
3. **双存储**：PostgreSQL 存元数据（trace 列表、用户信息），ClickHouse 存分析数据（按时间/模型/用户的聚合查询）。

### 2.3 Scoring 系统

LangFuse 的评分系统设计值得注意——它不强制评分格式：

```typescript
// SDK 端 —— 任意类型的分值
langfuse.score({
  traceId: "trace-123",
  name: "factual-accuracy",   // 评分名称
  value: 0.87,                // 可以是 number
  // value: "PASS",           // 也可以是 string
  // value: { score: 0.87, reason: "..." }  // 还可以是 object
  comment: "检查了 5 个事实陈述，4 个正确",
});
```

**设计哲学**：平台不定义"什么是好的评分"——用户定义评分维度，平台只管存储和聚合。这让 LangFuse 可以用于任何评估场景（事实准确性、安全性、语气、幻觉率...），而不是被锁定在特定的评分框架中。

### 2.4 与我们审计系统的对比

| 维度 | LangFuse | 我们的 AuditLogger + CostTracker |
|---|---|---|
| **数据模型** | Trace-Observation-Generation 三层 | AuditEntry 单层平面结构 |
| **摄入方式** | SDK buffer + 异步批量 | 同步内存写入 |
| **存储** | PostgreSQL + ClickHouse (双存储) | 内存 (Array) |
| **可扩展性** | 水平扩展，百万级 trace | 单进程（演示用途） |
| **评分** | 用户自定义评分维度 | CostPerOutcome 固定模型 |
| **防篡改** | 无（依赖数据库权限控制） | SHA-256 哈希链 |

**设计教训**：

1. **LangFuse 的 Trace-Observation 嵌套模型比我们的平面 AuditEntry 更表达力强**。我们的审计日志每条是独立的——它们通过 `previousEntryHash` 链起来，但缺少"这次 5 个 Agent 调用属于同一个用户请求"的层级关系。增加 `traceId` + `parentObservationId` 是明显的改进方向。

2. **LangFuse 的异步摄入是生产必需的**——同步写入审计日志会增加每次 Agent 调用的延迟。我们的 `AuditLogger.log()` 是同步的，在生产场景中会拖慢 Agent。

3. **我们的哈希链防篡改是一个差异化优势**——LangFuse 依赖数据库权限来防篡改，而我们的哈希链提供了数学上不可伪造的审计轨迹。在 EU AI Act 合规场景中，哈希链比"相信 DBA 不会改数据库"更有说服力。

---

## 3. 三个设计教训

### 3.1 "Modify, don't just Block"（NeMo Guardrails 启发）

NeMo Guardrails 的 `modify` 返回值提醒我们：安全护栏不是只有 allow/deny 两个选择。PII 检测到身份证号时，更好的做法是脱敏后继续（`modify`），而不是直接拒绝整个请求（`block`）。我们的 GuardrailPipeline 目前缺少这个中间状态，值得加入 `action: "REDACT"` 选项——自动将身份证号替换为 `[REDACTED]` 后继续处理。

### 3.2 "LLM calls are first-class citizens"（LangFuse 启发）

LangFuse 把 Generation（LLM 调用）单独建模，不与通用 Span 混在一起。我们的审计系统把所有操作都视为 AuditEntry——不管是 LLM 调用还是工具调用还是审查步骤。为 LLM 调用增加专门的 `LLMCallEntry`（继承 AuditEntry，增加 token 详情、model、prompt 版本），会让成本分析、质量分析更精准。

### 3.3 "Async ingestion is not optional"（LangFuse 启发）

LangFuse 在 SDK 端就用 buffer + 异步 flush。我们的做法——每条审计日志同步写入内存——在原型中完全没有问题（延迟 0ms），但在生产中每条日志同步写会累加成数百毫秒的额外延迟。异步 buffer + 批量 flush 是生产化的第一步。

---

## 4. 两个框架的共同盲区

两个框架都做得很好的领域之外，有一些明显的盲区：

1. **都不做成本预测**：NeMo Guardrails 和 LangFuse 都能告诉你"已经花了多少钱"，但都不能告诉你"这个任务预计要花多少钱"。我们的 `PricingEngine.estimateCost()` 是朝这个方向的一小步。

2. **NeMo Guardrails 不做运行时可观测性**：它的定位是"安全护栏"，不关心熔断器、限流、健康检查。LangFuse 做可观测性但不做安全护栏。**安全 + 可观测性 + 成本治理的三合一平台还不存在**——这就是 Phase 6 把三个模块放进一个 dashboard 的原因。

3. **都不做金丝雀发布**：两个框架都假设"模型是固定的"，没有提供"灰度切换模型并对比行为质量"的能力。我们的 CanarySimulator 填补了这个空白——虽然是模拟级别，但概念是完整的。

4. **LangFuse 的评分系统缺少"信任衰减"**：评分只增不减——一个 Agent 今天得了 0.9 分不代表一周后它仍然可信（Prompt 改了、模型换了、数据漂移了）。我们的 TrustScorer 的时间衰减模型是对这个问题的直接回应。

---

## 参考资料

- NVIDIA NeMo Guardrails: https://github.com/NVIDIA/NeMo-Guardrails
- NeMo Guardrails Architecture Docs: https://docs.nvidia.com/nemo/guardrails/
- LangFuse: https://github.com/langfuse/langfuse
- LangFuse Data Model: https://langfuse.com/docs/tracing
- LangFuse Scoring: https://langfuse.com/docs/scores/overview
- Promptfoo (grading reference): https://github.com/promptfoo/promptfoo
