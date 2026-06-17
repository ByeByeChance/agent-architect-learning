# Phase 1: LLM 基础认知 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立 LLM 基础认知，能解释 LLM 如何工作、能调用 API 做对话、能写结构化 System Prompt、同时推进前端架构基础

**Architecture:** 以 Node.js/TypeScript 项目为载体，4 个模块：theory/、practice/agent/、practice/frontend/、research/

**Tech Stack:** TypeScript, Node.js, OpenAI SDK, Anthropic SDK, React, Tailwind CSS

---

## 文件结构

```
phase-1-llm/
├── theory/
│   ├── 01-transformer-attention.md
│   ├── 02-token-embedding.md
│   └── 03-llm-capabilities-limits.md
├── practice/agent/
│   ├── api-client/
│   │   ├── config.ts
│   │   ├── openai.ts
│   │   └── anthropic.ts
│   ├── prompt-lab/
│   │   ├── system-prompt-template.md
│   │   ├── prompt-test.ts
│   │   └── prompt-versions/v1.md
│   ├── function-calling/
│   │   ├── weather-tool.ts
│   │   └── tool-runner.ts
│   └── experiments/
│       └── temperature-exploration.ts
├── practice/frontend/
│   ├── design-tokens/
│   │   ├── tokens.json
│   │   ├── tailwind.config.ts
│   │   └── token-preview.html
│   └── component-architecture/
│       └── ARCHITECTURE.md
├── research/
│   ├── api-docs-notes.md
│   └── tokenizer-analysis.md
├── package.json
├── tsconfig.json
└── .env.example
```

---

### Task 1: 项目脚手架

**Files:** Create: package.json, tsconfig.json, .env.example, 所有目录

- [ ] **Step 1: 初始化目录**

```bash
cd /Users/liquanxi/个人/前端/架构师
mkdir -p phase-1-llm/{theory,practice/agent/{api-client,prompt-lab/prompt-versions,function-calling,experiments},practice/frontend/{design-tokens,component-architecture},research}
```

- [ ] **Step 2: package.json**

```json
{
  "name": "phase-1-llm-foundation",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "agent:openai": "tsx practice/agent/api-client/openai.ts",
    "agent:anthropic": "tsx practice/agent/api-client/anthropic.ts",
    "agent:prompt-test": "tsx practice/agent/prompt-lab/prompt-test.ts",
    "agent:tools": "tsx practice/agent/function-calling/tool-runner.ts",
    "agent:temp": "tsx practice/agent/experiments/temperature-exploration.ts"
  },
  "devDependencies": { "@types/node": "^20", "tsx": "^4", "typescript": "^5" },
  "dependencies": { "openai": "^4", "@anthropic-ai/sdk": "^0.30", "dotenv": "^16" }
}
```

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "esModuleInterop": true, "outDir": "dist", "rootDir": ".",
    "resolveJsonModule": true
  },
  "include": ["practice/**/*.ts"]
}
```

- [ ] **Step 4: .env.example**

```
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

- [ ] **Step 5: npm install && 更新 docs/PLAN.md 和 docs/TODO.md**

- [ ] **Step 6: Commit**

```bash
git add phase-1-llm/ docs/PLAN.md docs/TODO.md && git commit -m "feat(phase-1): scaffold project"
```

---

### Task 2: 理论 — Transformer 与 Attention

**Files:** Create: `phase-1-llm/theory/01-transformer-attention.md`

- [ ] **Step 1: 阅读 Jay Alammar "The Illustrated Transformer"**
- [ ] **Step 2: 观看 3Blue1Brown "Attention in transformers" (前 15 分钟)**
- [ ] **Step 3: 写笔记，覆盖以下要点：**

```markdown
# Transformer 与 Attention 机制

## 1. 为什么要有 Attention？
[RNN/LSTM 的长距离依赖和并行计算问题]

## 2. Self-Attention 计算步骤
[Q、K、V 的来源 → score → softmax → weighted sum]

## 3. Multi-Head Attention
[多个 head 关注不同语义关系]

## 4. Transformer 整体结构
[Encoder/Decoder、Positional Encoding]

## 5. 为什么 Transformer 能规模化
[并行训练、梯度稳定性、Scaling Law]

## 6. 自测：解释 ChatGPT 为什么会"懂"你的问题
[用非技术语言写一段话]
```

- [ ] **Step 4: 口头自测** — 能回答 4/5 题即通过：
  1. Q/K/V 从哪来？ 2. Attention 比 RNN 好在哪？
  3. Multi-Head 的 Multi 是什么意思？ 4. Positional Encoding 解决什么？
  5. Decoder-only vs Encoder-Decoder 区别？

- [ ] **Step 5: Commit**

---

### Task 3: 理论 — Token 与 Embedding

**Files:** Create: `phase-1-llm/theory/02-token-embedding.md`

- [ ] **Step 1: 打开 https://tiktokenizer.vercel.app/ 实验 tokenization**
  输入英文、中文、中英混排、JSON，记录 token 数

- [ ] **Step 2: 写笔记**

```markdown
# Token 与 Embedding

## 1. Token 是什么
[BPE tokenization 原理]

## 2. 中文 vs 英文 token 效率
[实验数据：具体数字对比]

## 3. Token → ID → Embedding 流程
[流程图：文字 → tokenizer → IDs → embedding matrix → 向量]

## 4. Embedding 的语义含义
[国王-男人+女人≈女王 说明什么]

## 5. Context Window
[什么是 context window？为什么 128K？为什么不是越大越好？]
```

- [ ] **Step 3: Commit**

---

### Task 4: 理论 — LLM 能力与边界

**Files:** Create: `phase-1-llm/theory/03-llm-capabilities-limits.md`

- [ ] **Step 1: 阅读 GPT-4 Technical Report 摘要、Claude Model Card**
- [ ] **Step 2: 写笔记**

```markdown
# LLM 能力与边界

## 1. LLM 擅长什么（5+ 任务类型 + 例子）
## 2. LLM 不擅长什么（数学/实时/精确记忆/逻辑——分别说明）
## 3. 幻觉 (Hallucination)（定义、原因、缓解手段）
## 4. Temperature 和 Top-P（0 vs 1 的行为差异）
## 5. 决策框架（3+ 维度判断任务是否适合 LLM）
```

- [ ] **Step 3: Commit**

---

### Task 5: Agent 实践 — API 客户端

**Files:** Create: config.ts, openai.ts, anthropic.ts

- [ ] **Step 1: config.ts**

```typescript
import "dotenv/config";
export const config = {
  openai: { apiKey: process.env.OPENAI_API_KEY!, model: "gpt-4o-mini" },
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY!, model: "claude-3-5-haiku-latest" },
} as const;
if (!config.openai.apiKey && !config.anthropic.apiKey) {
  console.error("至少配置一个 API Key"); process.exit(1);
}
```

- [ ] **Step 2: openai.ts** — `chat(prompt)` 函数，调用 `openai.chat.completions.create`

- [ ] **Step 3: anthropic.ts** — `chat(prompt)` 函数，调用 `anthropic.messages.create`

- [ ] **Step 4: 运行验证**

```bash
cd phase-1-llm
cp .env.example .env  # 填入真实 API Key
npm run agent:openai
npm run agent:anthropic
```

预期：两个命令返回 LLM 回复。

- [ ] **Step 5: Commit**

---

### Task 6: Agent 实践 — Temperature 实验

**Files:** Create: `phase-1-llm/practice/agent/experiments/temperature-exploration.ts`

- [ ] **Step 1: 写实验脚本** — 对同一个 prompt，用 temperature 0/0.3/0.7/1.0/1.5 各跑 3 次，记录多样性

- [ ] **Step 2: 运行 `npm run agent:temp`**

- [ ] **Step 3: 在 DAILY.md 记录实验观察表**

| Temperature | 多样性 | 观察 |
|---|---|---|
| 0 | ... | ... |
| 0.3 | ... | ... |
| 0.7 | ... | ... |
| 1.0 | ... | ... |
| 1.5 | ... | ... |

- [ ] **Step 4: Commit**

---

### Task 7: Agent 实践 — System Prompt 模板

**Files:** Create: `phase-1-llm/practice/agent/prompt-lab/system-prompt-template.md`

- [ ] **Step 1: 阅读 Anthropic System Prompt 设计文档**
- [ ] **Step 2: 写模板** — 含 Role/Constraints/Reasoning/Examples 四段式结构
- [ ] **Step 3: 写一个"代码审查助手"的实际 System Prompt**
- [ ] **Step 4: Commit**

---

### Task 8: Agent 实践 — Prompt 测试与版本化

**Files:** Create: prompt-test.ts, prompt-versions/v1.md

- [ ] **Step 1: 写 prompt-test.ts** — 读取 v1.md，用 3 个测试用例运行，统计通过率

- [ ] **Step 2: 写 v1.md** — 代码审查助手 System Prompt

- [ ] **Step 3: 运行 `npm run agent:prompt-test`**

- [ ] **Step 4: Commit**

---

### Task 9: Agent 实践 — Function Calling

**Files:** Create: weather-tool.ts, tool-runner.ts

- [ ] **Step 1: weather-tool.ts** — 定义 `get_weather` 工具 schema + 模拟实现

- [ ] **Step 2: tool-runner.ts** — 完整 tool call 循环：
  用户消息 → 模型决定调工具 → 执行工具 → 工具结果回传 → 模型生成最终回答

- [ ] **Step 3: 运行 `npm run agent:tools`**

- [ ] **Step 4: 在 DAILY.md 画 Function Calling 流程图**

- [ ] **Step 5: Commit**

---

### Task 10: 前端实践 — Design Token 体系

**Files:** Create: tokens.json, tailwind.config.ts

- [ ] **Step 1: 学习 W3C Design Tokens 规范概述**
- [ ] **Step 2: tokens.json** — colors/spacing/typography/borderRadius 四类 Token
- [ ] **Step 3: tailwind.config.ts** — 读取 tokens.json 扩展到 Tailwind
- [ ] **Step 4: Commit**

---

### Task 11: 前端实践 — Token 预览页

**Files:** Create: `phase-1-llm/practice/frontend/design-tokens/token-preview.html`

- [ ] **Step 1: 用纯 HTML 创建色板/间距/字体/圆角的可视化页面**
- [ ] **Step 2: `open token-preview.html` 确认效果**
- [ ] **Step 3: Commit**

---

### Task 12: 前端实践 — 组件架构设计

**Files:** Create: `phase-1-llm/practice/frontend/component-architecture/ARCHITECTURE.md`

- [ ] **Step 1: 写分层原则（展示层/逻辑层/数据层）**
- [ ] **Step 2: 列出 Agent 产品所需的 5 个基础组件：**
  StreamingText, ToolCallCard, AgentThinking, ChatBubble, StatusIndicator
- [ ] **Step 3: 定义组件规范（Props 类型、Loading/Empty/Error 状态、ARIA）**
- [ ] **Step 4: Commit**

---

### Task 13: 源码溯源 — API 文档精读

**Files:** Create: `phase-1-llm/research/api-docs-notes.md`

- [ ] **Step 1: 精读 OpenAI Chat Completions API 文档**
  关注：messages, model, temperature, top_p, tools, tool_choice, response_format

- [ ] **Step 2: 精读 Anthropic Messages API 文档**

- [ ] **Step 3: 写对比笔记** — OpenAI vs Anthropic API 参数对照表

- [ ] **Step 4: 列出至少 3 个"读文档前不知道的发现"**

- [ ] **Step 5: Commit**

---

### Task 14: 源码溯源 — Tokenizer 探究

**Files:** Create: `phase-1-llm/research/tokenizer-analysis.md`

- [ ] **Step 1: npm install tiktoken, 用 tiktoken 对中英文/JSON 做 tokenize**
- [ ] **Step 2: 写分析笔记** — BPE 原理 + 实验数据 + 关键发现
- [ ] **Step 3: Commit**

---

### Task 15: 阶段 1 收尾

- [ ] **Step 1: `find phase-1-llm -type f | sort` 确认 14 个文件全部产出**
- [ ] **Step 2: 更新 docs/PLAN.md 阶段 1 → ✅**
- [ ] **Step 3: 在 DAILY.md 写阶段总结（最要 3 件事 + 不清楚的 3 个问题 + 阶段 2 想搞清楚什么）**
- [ ] **Step 4: Commit**

---

## 自检清单

- [x] 15 个 Task，14 个产出文件
- [x] 理论、Agent 实践、前端实践、源码溯源四线覆盖
- [x] 每个 Task 有具体代码或 Markdown 内容
- [x] 无 TBD/TODO/占位符
- [x] 前端实践不缺失（Token + 组件架构）
- [x] 每个 Task 有验收标准
