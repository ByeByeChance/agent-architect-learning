# 上下文与记忆管理

> 核心问题：LLM 是"无状态"的——每次调用都是全新对话。Agent 如何"记住"之前说过什么、做过什么、知道什么？答案是 **上下文管理 + 记忆系统**。

---

## 1. 先说清楚：Context 不是 Memory

这是最容易被混淆的概念：

| | Context（上下文） | Memory（记忆） |
|---|---|---|
| 定义 | 当前请求附带的所有信息 | 跨请求持久化的信息 |
| 生命周期 | 单次 API 调用 | 跨会话、跨天 |
| 存放位置 | Prompt 的 messages 数组 | 向量库 / 数据库 / 文件系统 |
| 容量 | 受 context window 限制 | 理论上无限 |
| 类比 | 你当前在想的事情 | 你知道的所有事情 |

**关键关系**：Memory 是仓库，Context 是工作台。Agent 从 Memory 中检索相关信息，放入 Context 供 LLM 使用。

---

## 2. Context Window 管理

### 为什么需要管理

```
Context Window 容量分布（以 Claude 200K 为例）：

[System Prompt: 1K tokens]
[Memory 检索结果: 5K tokens]
[最近 10 轮对话: 15K tokens]
[工具调用历史: 8K tokens]
[用户当前问题: 200 tokens]
[剩余可用: ~170K tokens] ← 看起来很多？

但实际场景：
- 长文档 RAG: 一次检索就要 10-20K
- 复杂 Agent: 20+ 轮工具调用，每轮加入工具输出
- 多文件代码审查: 每个文件几千行

结论：200K 看着很多，但 Agent 场景下几分钟就能填满。
```

### 三种上下文管理策略

**(1) 滑动窗口（Sliding Window）**

```
时间 →   旧 ←—————————————→ 新
    
[msg1] [msg2] [msg3] [msg4] [msg5] [msg6] [msg7] [msg8]
  ✗      ✗      ✓      ✓      ✓      ✓      ✓      ✓
         ↑                           ↑
      被丢弃                    保留最近N条
```

最粗暴：保留最近 N 条消息，丢弃旧消息。

优点：简单。缺点：丢失早期重要信息（比如用户一开始说的需求）。

**(2) 摘要压缩（Summary Compression）**

```
[msg1] [msg2] [msg3] [msg4] [msg5] [msg6] [msg7] [msg8]
  │                              │
  └──────── 摘要 ────────────────┘     保留原文
       ↓
  "用户要一个 React dashboard，3 个 tab，
   数据从 REST API 获取，需要暗色主题。
   已完成：项目脚手架、tab 导航、API 客户端。
   待完成：图表组件、响应式布局。"
```

当对话超过阈值时，让 LLM 把旧消息压缩成摘要。摘要保留语义但节省 token。

**(3) 混合策略（Hybrid）——生产环境推荐**

```
┌─────────────────────────────────────────────┐
│ Context Window (200K tokens)                 │
├─────────────────────────────────────────────┤
│ System Prompt (1K)           ← 核心规则      │
│ Memory Injection (3K)        ← 长期记忆      │
│ Summary (2K)                 ← 旧对话摘要    │
│ Recent Messages (last 8)     ← 最近原文      │
│ RAG Results                  ← 实时检索      │
│ ... 剩余空间用于工具调用和生成               │
└─────────────────────────────────────────────┘
```

每次新对话轮次时：
1. 检查 context 使用率
2. 如果 > 70%，对最早的 50% 消息生成摘要
3. 摘要 + 最近消息 + System Prompt + RAG 结果 = 新 context

---

## 3. Agent 记忆系统

### 三层记忆模型

这是认知科学在 Agent 设计中的映射：

```
┌──────────────────────────────────────────────┐
│                  记忆系统                      │
├───────────────┬──────────────┬────────────────┤
│  工作记忆      │  短期记忆     │  长期记忆       │
│  Working       │  Short-term   │  Long-term      │
│  Memory        │  Memory       │  Memory         │
├───────────────┼──────────────┼────────────────┤
│ 类比：当前     │ 类比：今天     │ 类比：一生       │
│ 在想的事情     │ 发生过的事     │ 学到的知识      │
├───────────────┼──────────────┼────────────────┤
│ 存储：Context  │ 存储：Session │ 存储：向量库     │
│ 容量：200K     │ 容量：会话级   │ 容量：无限       │
│ 生命周期：1次  │ 生命周期：1次  │ 生命周期：永久   │
│ API调用        │ 会话          │                 │
├───────────────┼──────────────┼────────────────┤
│ 内容：         │ 内容：         │ 内容：           │
│ · 当前消息     │ · 对话历史     │ · 用户偏好       │
│ · 工具调用结果 │ · 工具调用记录 │ · 领域知识       │
│ · 检索到的文档 │ · 中间结论     │ · 项目上下文     │
│ · 推理中间步骤 │ · 任务进度     │ · 历史决策       │
└───────────────┴──────────────┴────────────────┘
```

### 工作记忆（Working Memory）

就是 Context Window 的内容。需要管理的内容：
- 用户当前问题的上下文
- 本次任务相关的工具调用结果
- RAG 检索到的文档
- 推理链的中间步骤

**管理原则**：只保留"当前任务绝对必要"的信息。类比：你不会一边做饭一边想着昨天吃过的早饭。

### 短期记忆（Short-term Memory）

本次会话的历史。典型实现：

```typescript
interface ShortTermMemory {
  messages: Message[];           // 完整对话历史
  toolCalls: ToolCallRecord[];   // 所有工具调用
  conclusions: string[];         // 阶段性结论
  taskProgress: TaskProgress;    // 当前任务进度
}

// 压缩策略：每 N 轮生成摘要
async function compress(memory: ShortTermMemory): Promise<string> {
  const oldMessages = memory.messages.slice(0, -RECENT_KEEP_COUNT);
  const summary = await llm.chat([
    { role: "system", content: "将以下对话历史压缩为摘要。" },
    { role: "user", content: formatMessages(oldMessages) }
  ]);
  return summary.content;
}
```

### 长期记忆（Long-term Memory）

跨会话持久化的信息。三类：

**(1) 语义记忆（Semantic）**——事实和知识

```
用户偏好：
  "用户喜欢 TypeScript，不喜欢 Python"
  "用户团队用 React + Zustand"
  "用户的 API Key 是 sk-xxx（加密存储）"

项目知识：
  "项目A 的数据库是 PostgreSQL"
  "项目B 的部署在 Vercel"
  "MCP Server 的端口约定是 5199"
```

存储方式：向量库（语义搜索）或结构化 DB（精确查询）。

**(2) 情节记忆（Episodic）**——发生过的事件

```
历史对话摘要：
  "2026-06-17: 用户问过 React 18 Server Components，我推荐了 Next.js App Router"
  "2026-06-18: Phase 2 MCP Server 构建完成，3 个 Server 全部通过测试"
  "2026-06-23: 用户确认 Prompt 测试套件的 graderError 设计合理"
```

存储方式：时间序列 DB 或向量库（按时间排序）。

**(3) 程序记忆（Procedural）**——怎么做

```
操作模式：
  "用户偏好先理论再实践"
  "代码审查要先看安全再谈性能"
  "每个阶段结束要更新 PLAN.md 和 TODO.md"
```

存储方式：规则引擎或 prompt 中的固定规则。

### 记忆检索策略

```
用户问了一个问题
        ↓
   需要记忆吗？
   ↙        ↘
 不需要      需要
 直接回答        ↓
          检索什么类型？
        ↙    ↓    ↘
    工作记忆  短期  长期
    (直接)  (会话) (检索)
              ↓      ↓
         关键词匹配  向量检索
              ↓      ↓
          拼入 Context ──→ LLM 生成
```

---

## 4. 上下文压缩技术

### LLMLingua 风格压缩

不是简单的截断——是用小模型"翻译"成大模型能理解的简洁版：

```
原文（350 tokens）：
"在 React 18 中，Suspense 组件允许你在组件树中指定加载状态。
当你使用 React.lazy() 进行代码分割时，你可以在等待懒加载组件
加载时显示一个 fallback UI。此外，React 18 还支持了 Suspense 
在服务端的流式渲染（Streaming SSR），这意味着你可以在服务端
渲染过程中分块发送 HTML，而不是等待整个页面渲染完成..."
        ↓ LLMLingua 压缩
压缩后（80 tokens）：
"React 18 Suspense: 1) lazy加载时显示fallback, 2) 支持SSR流式渲染,
分块发送HTML而非等待整页完成..."

保留关键信息，丢弃冗余修饰。节省 77% token。
```

**核心原理**：训练一个小模型（或让 LLM 自身）识别"哪些信息对任务有用"，只保留那些。

### 选择性上下文（Selective Context）

不是压缩，是选择：从长对话中选出"对当前问题最有用的 N 条消息"。

```typescript
async function selectRelevantMessages(
  currentQuestion: string,
  history: Message[],
  topN: number
): Promise<Message[]> {
  // 1. 对每条历史消息做 embedding
  const historyEmbeddings = await embedder.encodeBatch(
    history.map(m => m.content)
  );
  
  // 2. 对当前问题做 embedding
  const questionEmbedding = await embedder.encode(currentQuestion);
  
  // 3. 余弦相似度排序，选 top N
  const scored = historyEmbeddings.map((emb, i) => ({
    index: i,
    score: cosineSimilarity(questionEmbedding, emb)
  }));
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(s => history[s.index]);
}
```

---

## 5. 记忆系统的实现架构

```typescript
interface MemoryManager {
  // 工作记忆 —— 直接操作 messages 数组
  addToWorkingMemory(message: Message): void;
  getWorkingMemory(): Message[];
  
  // 短期记忆 —— 会话级存储
  recordInteraction(userMsg: string, assistantMsg: string): void;
  recordToolCall(tool: string, input: any, output: any): void;
  compress(): Promise<string>; // 触发摘要压缩
  getShortTermSummary(): string;
  
  // 长期记忆 —— 持久化存储
  remember(key: string, value: any, type: "semantic" | "episodic"): Promise<void>;
  recall(query: string, type?: "semantic" | "episodic"): Promise<MemoryItem[]>;
  forget(key: string): Promise<void>;
  
  // Context 组装 —— 把以上拼成最终 context
  assembleContext(userInput: string): Promise<Message[]>;
}

async function assembleContext(
  input: string,
  memory: MemoryManager,
  config: ContextConfig
): Promise<Message[]> {
  const context: Message[] = [];
  
  // 1. System Prompt（固定）
  context.push({ role: "system", content: config.systemPrompt });
  
  // 2. 长期记忆注入
  const relevant = await memory.recall(input, "semantic");
  if (relevant.length > 0) {
    context.push({
      role: "system",
      content: `[Memory] 相关已知信息：\n${formatMemories(relevant)}`
    });
  }
  
  // 3. 短期记忆摘要
  const summary = memory.getShortTermSummary();
  if (summary) {
    context.push({
      role: "system",
      content: `[History] 对话摘要：${summary}`
    });
  }
  
  // 4. 最近消息（原文，不压缩）
  const recent = memory.getWorkingMemory().slice(-config.recentKeep);
  context.push(...recent);
  
  // 5. 当前用户输入
  context.push({ role: "user", content: input });
  
  // 6. Token 预算检查
  const totalTokens = estimateTokens(context);
  if (totalTokens > config.maxTokens) {
    // 紧急压缩：减少 recent 数量或截断 System Prompt
    console.warn(`Context overflow: ${totalTokens} > ${config.maxTokens}`);
  }
  
  return context;
}
```

---

## 6. 记忆的"遗忘"与"冲突"

### 遗忘曲线

LLM 的"遗忘"不是记忆消失——是长对话中模型对 System Prompt 的遵循度随 token 距离递减：

```
System Prompt 遵循度
    │
100%│█
    │ ██
 80%│   ███
    │      ███
 60%│         ████
    │             ██████
 40%│                   ██████████
    │                             ██████
    └────────────────────────────────────→ 距离 System Prompt 的 token 距离
    0    20K   40K   60K   80K   100K  120K
```

这是"Lost in the Middle"现象——模型对 prompt 中间位置的信息关注度最低，对开头和结尾最高。

**应对**：
- 关键约束放在 System Prompt 开头或末尾（而非中段）
- 重要约束在长对话中途重新注入（Anthropic 的 `mid_conv_system` block）
- 控制单次会话长度，超过阈值就开新会话并摘要前情

### 记忆冲突

当新旧记忆矛盾时：

```
旧记忆：用户使用 React 17
新经验：用户说"我刚升到 React 18"

处理策略：
1. 检测冲突：新旧信息矛盾
2. 更新长期记忆：用新信息覆盖旧信息
3. 记录变更：把旧记忆标记为"过期"而非删除
```

---

## 7. 自己问自己的 3 个问题

1. **为什么不能把所有对话历史都存下来然后检索就行了？**
   答：可以，这正是 Mem0 和 MemGPT 的做法。但问题是：(1) 精准检索历史对话很难——"上次讨论的那个 React 问题"是哪个？(2) 历史对话的噪声比有用信息多得多。摘要压缩的本质是"去噪"。

2. **200K context window 还不够用吗，为什么还要管理？**
   答：200K 是很大，但：(1) 长 context 让 LLM 更慢（Attention 复杂度 O(n²)），延迟从 1s 变 10s；(2) "Lost in the Middle"效应——信息太多反而找不到重点；(3) 成本——每次调用都给 LLM 传 200K token 的成本是巨大的。

3. **工作记忆和短期记忆的区别到底是什么？**
   答：工作记忆是"现在在 context 里的"，短期记忆是"本次会话有过但现在被移出 context 的"。类比：你正在看的这本书（工作记忆）vs 你今天下午读过的另一本书（短期记忆）。你能快速回忆起下午那本书的内容，但它不在你当前注意力范围内。

---

## 参考资料

- MemGPT (Packer et al., 2023): "MemGPT: Towards LLMs as Operating Systems" — 记忆管理核心论文
- Mem0: https://github.com/mem0ai/mem0 — 开源记忆层实现
- LLMLingua: https://github.com/microsoft/LLMLingua — 微软上下文压缩
- Liu et al. (2023), "Lost in the Middle: How Language Models Use Long Contexts" — 长上下文遗忘问题
- Anthropic Context Engineering Guide: https://docs.anthropic.com/en/docs/build-with-claude/context-windows
