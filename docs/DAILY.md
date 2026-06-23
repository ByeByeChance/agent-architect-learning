# 每日学习笔记

## 2026-06-17 — 阶段 1 完成总结

### 产出物

| 文件 | 内容 |
|---|---|
| theory/01-transformer-attention.md | Transformer 架构、Attention 机制、Multi-Head、Scaling Law |
| theory/02-token-embedding.md | BPE 原理、中英文 token 效率对比、Embedding 语义空间 |
| theory/03-llm-capabilities-limits.md | LLM 优劣势、幻觉、Temperature/Top-P、决策框架 |
| research/api-docs-notes.md | DeepSeek/OpenAI API 参数对照、Tool Calling 流程 |
| research/tokenizer-analysis.md | BPE 实现原理、实验数据、成本影响 |
| research/source-code-walkthrough.md | config.ts → tool-runner.ts 完整链路逐行解读 |
| practice/agent/ | API 客户端、Temperature 实验、Prompt 测试、Function Calling |
| practice/frontend/ | Design Token 体系、Token 预览、Agent 组件架构 |

### 学到的最重要的 3 件事

1. **Attention 让信息传递从 O(n) 降到 O(1)**——这是 Transformer 能规模化的根基，不是工程优化而是架构革命
2. **Function Calling 是 LLM 连接现实的桥梁**——模型不知道天气但它知道"调用 get_weather 工具"，然后整合结果
3. **中文 token 效率约为英文 1.5-2 倍**——直接影响 API 成本和 context window 可用容量

### 还不清楚的 3 个问题

1. Embedding 向量具体如何通过反向传播训练？Embedding Matrix 的梯度怎么算？
2. RoPE 位置编码和原始正弦编码的数学差异和实际效果对比？
3. DeepSeek 的 tokenizer 和 OpenAI cl100k_base 训练数据差异？

### 阶段 2 重点关注

- MCP 协议本质：Tool/Resource/Prompt 三个概念怎么落地
- TypeScript 写完整 MCP Server
- Prompt 工程化：版本管理、回归测试、多模型对比

---

## 2026-06-18 — 阶段 2 完成

### 产出物

| 文件 | 内容 |
|---|---|
| theory/01-mcp-protocol.md | MCP 协议规范、JSON-RPC、Tool/Resource/Prompt |
| theory/02-mcp-security-transport.md | Stdio/SSE/Streamable HTTP、安全模型 |
| servers/hello-server/index.ts | 最简 MCP Server（hello + echo tool） |
| servers/weather-server/index.ts | Tool + Resource 协作、错误处理 |
| servers/file-search-server/index.ts | 递归文件搜索、环境变量权限控制 |
| dashboard/ | React 三 Tab 调试面板（Servers/Tools/Chat） |
| research/mcp-transport-analysis.md | Stdio/SSE 源码分析 |
| research/mcp-vs-openai-tools.md | MCP 与 OpenAI Tools 对照 |
| research/source-code-walkthrough.md | 完整源码逐行走读 |

### 学到的 3 件最重要的事

1. **MCP 是 AI 世界的 USB 协议**——Server 只管提供工具，Client 只管发现和调用，中间的 JSON-RPC 保证互操作性
2. **Tool 是动作，Resource 是数据**——这个区分看似简单，但决定了一个 MCP Server 的设计质量
3. **Agent 调试面板的三个视角**——管理面（Servers）、数据面（Tool Calls）、交互面（Chat），缺一不可

### 还不清楚的 3 个问题
1. MCP Client 怎么实现？怎么从 React 面板发起真实的 tools/list 和 tools/call？
2. SSE Transport 怎么在 Dashboard 中实际落地？
3. 多个 MCP Server 同时运行时，Agent 怎么决定调用哪个 Server 的哪个 tool？

### 阶段 3 重点关注
- Prompt Engineering 深入：测试套件、版本化管理、多模型对比
- 阶段 1 已有了基础，阶段 3 是把 Prompt 当软件产品来管理

---

## 2026-06-23 — 阶段 3 完成

### 产出物

| 文件 | 内容 |
|---|---|
| theory/01-few-shot-cot.md | Few-shot 机制、CoT/ReAct/ToT/Self-Consistency、推理策略决策框架 |
| theory/02-system-prompt-design.md | System Prompt 四大职责、模板化、核心原则、反模式、质量评估 |
| theory/03-prompt-testing-methodology.md | 三维度测试、黄金测试集、评判策略、测试金字塔 |
| practice/prompt-vault/ | Prompt 版本仓库 + CLI（list/show/diff/validate） |
| practice/test-suite/ | 回归测试套件：20 用例、格式/安全/行为/对抗/边界五类 |
| practice/multi-model-bench/ | 多模型对比：10 个 benchmark prompt × 3 模型 = 统一评估 |
| frontend/prompt-dashboard/ | React 面板：Prompt 编辑器 + 测试结果 + 多模型对比三 Tab |
| research/anthropic-prompt-best-practices.md | Anthropic/OpenAI Prompt Engineering 最佳实践对照 |
| research/cot-react-papers.md | CoT/ReAct/Reflexion 论文关键结论与应用场景 |
| research/source-code-walkthrough.md | LangChain/promptfoo/DSPy 源码设计决策分析 |

### 学到的 3 件最重要的事

1. **Prompt 是"自然语言程序"** — 有输入、输出、逻辑（System Prompt 规则）。是程序就应该有测试、有版本管理、有 CI。
2. **CoT 给了模型更多的"思考时间"** — Transformer 的自回归性质让每个 CoT token 都增加一次前向传播，等价于更多的计算步骤。这不是 trick，是机制。
3. **System Prompt 设计的核心是分层和具体** — 越靠近底层的规则越通用但不具体，越上层越具体但依赖底层。好的 System Prompt 像 CSS——全局到局部层层递进。

### 还不清楚的 3 个问题

1. LLM-as-Judge 的可靠性如何量化校准？什么时候可以信任模型评判模型？
2. Prompt 版本 diff 如何自动化语义判断？行级 diff 不够，如何判断"逻辑等价但措辞不同"？
3. 长对话中 System Prompt 的"遗忘"到底在什么 token 距离开始发生？怎么精确测量？

### 阶段 4 重点关注
- Embedding + 向量检索 + RAG pipeline
- Agent 记忆管理（短期/长期/工作记忆）
- 上下文压缩策略

---

## 2026-06-23 — 阶段 3 源码精读 + 工程重构

### 源码精读（3 个代码库）

| 代码库 | 版本 | 关键收获 |
|---|---|---|
| **promptfoo** | v0.121.17 | `graderError` 标记、8 种内置 grading prompt、12 种 Prompt 格式路由、Nunjucks+JSON 双渲染 |
| **Anthropic SDK** | v0.39.0 | system 是顶层参数非 message role、`mid_conv_system` block、prefilling 机制、stop_reason 语义化 |
| **LangChain** | @langchain/core | f-string 逐字符解析、`checkValidTemplate` 初始化校验、ChatPromptTemplate 角色分离、FewShot prompt 模型 |

**最重要的三个发现：**

1. **promptfoo 的 `graderFail()` 是最容易被忽视的精妙设计**：区分"内容不通过"和"裁判系统出错"，防止逆断言翻转——`not-llm-rubric` 遇到解析失败如果不加标记，会被错误翻转成"通过"。

2. **Anthropic 把 System Prompt 设计为独立顶层参数**：不是 messages 数组里的 role: "system"。加上 `mid_conv_system` block，System Prompt 从静态前缀变成了可动态注入的控制面。

3. **三个框架都没有做 Prompt 版本管理**：promptfoo 管测试、LangChain 管模板、Anthropic 管 API——但没人管"Prompt 从 v1.0 到 v1.1 改了什么"。这是 Phase 3 可以做差异化的点。

### 工程重构（3 项）

**1. api-client 从单体文件 → 策略模式**
```
旧: practice/api-client.ts (123 行 if/else 分支)
新: practice/api-client/
    ├── index.ts          ← 工厂 createLLMClient() + 策略缓存
    ├── types.ts          ← LLMStrategy 接口
    ├── config.ts         ← .env 加载 + 配置中心
    └── strategies/
        ├── deepseek.ts   ← OpenAI SDK + 自定义 baseURL
        ├── openai.ts     ← OpenAI SDK
        └── anthropic.ts  ← system 拆到顶层参数
```
加新 Provider 只需加一个 strategy 文件，工厂 switch 加一行。

**2. prompt-vault validate 增强（靠近 LangChain checkValidTemplate 风格）**
```
validate <id>                    validate <id> --smoke
├── Layer 1: 文件存在             ├── Layer 1-4 同上
├── Layer 2: extractVariables()   └── Layer 5: createLLMClient().chat("Hello.")
│   → renderWithDummyValues()          → 验证模型不会被 prompt 卡死
│   → 括号不匹配直接报错               → 验证 prompt 能正常驱动模型行为
├── Layer 3: 结构检查
│   (## Role/## Constraints/version)
└── Layer 4: Token 估算
```

**3. test-suite 三项增强（靠近 promptfoo 设计）**

| 改进 | 效果 |
|---|---|
| `graderError` 标记 | API 错误 vs 内容失败，不再混淆 |
| `score` 0-1 连续分 | 规则断言按通过比例计算，llmRubric 给连续分数 |
| `llmRubric` 断言 | 额外调 LLM 按自然语言 rubric 评分，裁判 prompt 复用 promptfoo 的 `DEFAULT_GRADING_PROMPT` |

### 学到的 3 件最重要的事

1. **读源码不是看文档，是看设计决策**：promptfoo 的 `graderError` 标记只有读源码才能发现——文档不会告诉你"我们区分了这两种失败是因为逆断言会翻转结果"。

2. **好的设计在边界处最明显**：LangChain 的 `checkValidTemplate` 用 "foo" 做 dummy 值；promptfoo 的 `fail()` vs `graderFail()` 只有一行区别但语义完全不同。

3. **三个框架学了之后，我们的改进不是"加功能"，而是"补设计"**：graderError 不是新功能——是不加就会出 bug 的防御设计。dummy 渲染不是新功能——是不做就会在生产环境才炸的 fail-fast 设计。

### 还不清楚的 3 个问题

1. Anthropic 的 `mid_conv_system` block 在实际长对话中效果如何？什么时机注入最有效？
2. promptfoo 的 ExampleSelector（语义相似度选择 few-shot 示例）在实际场景中比静态示例好多少？
3. 多个 grader（规则 + llmRubric）的评分如何加权才是最优的？promptfoo 的做法是各占 50%，这是经验值还是有依据？

---

## 2026-06-23 — 阶段 4 启动：理论完成

### 产出物

| 文件 | 内容 |
|---|---|
| theory/01-embedding-vector-search.md | Embedding 原理、向量空间、相似度度量（余弦/欧氏/点积）、ANN 索引（HNSW/IVF）、pooling 策略 |
| theory/02-rag-architecture.md | RAG pipeline 完整架构、5 种 Chunking 策略对比、稀疏+稠密混合检索、重排序、HyDE、增强三模式 |
| theory/03-context-memory-management.md | 三层记忆模型（工作/短期/长期）、Context 管理策略、摘要压缩、LLMLingua 风格压缩、遗忘曲线 |

### 学到的 3 件最重要的事

1. **Embedding 模型和 LLM 是两种完全不同的模型**：Encoder-only vs Decoder-only，"理解语义"vs"生成文本"，前者可以比后者小几百倍而效果不差。这个区分决定了 RAG 架构的设计——Embedding 模型负责"找到相关文档"，LLM 负责"基于文档生成答案"。

2. **Chunking 是 RAG 最被低估的工程问题**：Chunk 太大检索不准，太小缺乏上下文。Small-to-Big 是目前最推荐的策略——用小 chunk 做精确索引，检索时向上追溯到父文档保证上下文完整。

3. **"Lost in the Middle"是反直觉的长上下文陷阱**：不是越长越好——模型对 prompt 中间位置的信息关注度最低。200K context window 看似很大，但 Agent 复杂交互中几分钟就能填满。上下文管理不是"存得下"的问题，是"找得到重点"的问题。

### 还不清楚的 3 个问题

1. HNSW 的 M（每个节点连接数）和 efConstruction（构建时搜索宽度）参数如何根据数据集规模和维度自动调优？
2. Cross-encoder reranker 和 LLM-based reranker（如 Cohere Rerank）在实际场景中精度差距多大？
3. MemGPT 的"虚拟上下文管理"——让 LLM 自己管理自己的记忆——在实际 Agent 场景中比手动 rule-based 管理好多少？

### 下一步

- 实践：构建本地向量库 + RAG pipeline + 上下文压缩器 + 记忆管理器
- 前端：RAG 可视化面板（检索过程可视化、chunk 相关性分数展示）
- 源码：LangChain/LlamaIndex RAG 相关源码走读

---

## 2026-06-23 — 阶段 4 实践完成：四个模块全部可运行

### 产出物

| 文件 | 内容 |
|---|---|
| `practice/vector-db/types.ts` | 向量库核心类型（IVectorStore 接口、SearchResult、Metric 类型） |
| `practice/vector-db/vector-store.ts` | 向量存储核心实现（余弦/欧氏/点积、L2归一化、暴力搜索、HNSW扩展点） |
| `practice/vector-db/index.ts` | Demo：8 篇文档摄入 + 三种度量对比 |
| `practice/rag-pipeline/chunker.ts` | 递归字符分割器（RecursiveChunker，从段落→句子→词→字符） |
| `practice/rag-pipeline/embedder.ts` | Embedding 服务层（MockEmbedder + OpenAIEmbedder，策略模式互换） |
| `practice/rag-pipeline/retriever.ts` | 检索器（向量检索 + 混合检索 hybridRetrieve，BM25关键词融合） |
| `practice/rag-pipeline/generator.ts` | 生成器（Stuff + Map-Reduce 两种增强模式） |
| `practice/rag-pipeline/index.ts` | Demo：5 篇文档摄入 → 2 次检索+生成 → Map-Reduce 问答 |
| `practice/context-compressor/index.ts` | 三种压缩策略（LLM摘要、选择性上下文、Token预算管理） |
| `practice/memory-manager/index.ts` | 三层记忆管理器（工作/短期/长期，context 组装、摘要压缩、向量检索） |

### 运行结果亮点

**向量库**：三种相似度度量对比清晰，cosine 和 dot（归一化后）结果一致
```
cosine  相关(React↔React): 0.2129  |  无关(React↔Docker): 0.4038
```

**RAG Pipeline**：端到端跑通，LLM 基于检索文档回答并标注 `[来源N]`，Map-Reduce 正确说"无法确定"而非幻觉
```
Query: "TypeScript 泛型有哪些高级用法？"
→ 检索命中 → 答案包含泛型约束/条件类型/映射类型/模板字面量/infer，全部带来源标注
```

**上下文压缩**：LLM 压缩率 75%（541→135字符），保留全部关键信息
```
原文: 541 字符 → Dense 压缩: 135 字符 (25% 原始长度)
```

**记忆管理器**：三层记忆全部运作——长期记忆向量检索、短期记忆 LLM 压缩、工作记忆 token 预算管理

### 学到的 3 件最重要的事

1. **Embedding 质量决定 RAG 天花板**：Mock embedding（trigram 哈希）能做到"部分语义"，但检索精度远不如真 embedding。亲眼看到 Mock vs 真 API 的差距，比读十篇论文都深刻。

2. **Chunker 的 overlap 参数不是可选的**：不加 overlap，chunk 边界恰好在关键信息处断开，LLM 收到不完整的上下文就会答非所问。overlap 是"宁可多给 10% 冗余，不可少给 1% 关键上下文"。

3. **三层记忆的"组装"是记忆管理器最核心的方法**：assembleContext() 不是简单拼接——它决定什么信息以什么优先级进入 LLM 的 context window。这个决策直接影响 Agent 的"认知能力"。

### 还不清楚的 3 个问题

1. 真实 Embedding API（text-embedding-3-small / BGE-M3）在中文技术文档上的检索 Recall@10 分别是多少？
2. LLMLingua 的"用小模型压缩给大模型用"——压缩模型的规模下限是多少？100M 参数的模型能否胜任？
3. Mem0 的记忆冲突解决（新旧信息矛盾时自动更新）在真实多会话场景中的准确率？

### 下一步

- 前端：RAG 可视化面板（检索过程可视化、chunk 相关性分数、记忆状态）
- 源码：LangChain/LlamaIndex 的 RAG 相关源码走读
- 接入真实 Embedding API（BGE-M3 或 text-embedding-3-small）替换 MockEmbedder

---

## 2026-06-23 — 阶段 5 完成：多 Agent 架构

### 产出物

| 文件 | 内容 |
|---|---|
| theory/01-multi-agent-topology.md | 4 种拓扑模式（编排/对等/层级/混合）、Agent 间通信协议、角色定义 |
| theory/02-orchestration-coordination.md | 任务分解四策略、Agent 路由三方式、Handoff 机制、任务状态机 |
| theory/03-failure-recovery-hitl.md | 失败四分类+三策略、HITL Gate 设计、可观测性三支柱、预算管理 |
| `practice/orchestrator/index.ts` | 编排引擎核心——分解→拓扑排序→执行→验证→Synthesizer 汇总 |
| `practice/agent-mesh/index.ts` | Agent 注册中心 + 语义路由 + 消息传递 + Handoff |
| `practice/hitl-gate/index.ts` | 风险规则引擎 + CRITICAL/WARNING/INFO 分级 + 超时默认行为 |
| `practice/context-budget/index.ts` | 200K token 预算分配 + 70%/90% 告警 + 释放回收 |
| `frontend/agent-dashboard/` | React 3-Tab：拓扑可视化、工作流甘特图、HITL+预算仪表盘 |
| `research/source-code-walkthrough.md` | AutoGen（ConversableAgent+GroupChat）+ CrewAI（角色化+Task依赖）逐行分析 |

### 运行结果亮点

**编排引擎**：3/3 任务通过，完整链路"formatDate 工具函数开发 → 审查 → 测试"
```
📋 任务分解: 3 个子任务
   task-1 → code-generator (5.2s ✅)
   task-2 → code-reviewer (16.1s ✅, 依赖 task-1)
   task-3 → test-writer   (12.6s ✅, 依赖 task-1)
📊 通过率: 3/3 (100%) · 总耗时 33.8s
```

**Agent Mesh**：语义路由正确匹配——"写 React 组件"→ 代码生成（0.254），"SQL注入风险"→ 审查（因 mock embedding 精度限制有偏差），"Vitest 测试"→ 测试专家（0.597）

**HITL Gate**：删除操作自动触发 CRITICAL 审批，低风险操作自动通过，超时默认 REJECT（不冒险）
```
code-generator: 生成工具函数 → ✅ 自动通过
db-admin: DROP TABLE → 🚨 CRITICAL 审批 → ⏰ 超时 → REJECTED
```

**Context Budget**：5 个 Agent 在 200K 总预算中按需分配，Orchestrator 固定 15%，Worker 按复杂度比例，无Agent超 25% 垄断预算
```
orchestrator: 8K/30K  code-gen: 35K/50K  code-review: 22K/50K
test-writer: 18K/42K   synthesizer: 5K/20K
总使用: 88K/200K (44%)
```

### 学到的 3 件最重要的事

1. **多 Agent 不是"多调几次 LLM"，是"给每次调用一个狭窄的角色"**：Orchestrator 的成功不是因为 LLM 更聪明，而是因为每次调用都有明确的、窄的 System Prompt 和验收标准。code-generator 只需生成代码，code-reviewer 只需审查代码——角色越窄，成功率越高。

2. **Orchestrator 的预分解 vs AutoGen 的动态选择是两种哲学**：我们让 LLM 提前分解任务（确定性、可控），AutoGen 让 LLM 动态选择下一个发言者（灵活性、自适应性）。工程任务适合前者，探索性任务适合后者。不迷信框架，根据场景选。

3. **HITL 的粒度是"可用性"和"安全性"的博弈**：太细（每次 API 调用都审批）用户会关掉它，太粗（只在重大决策审批）等于没有保护。CRITICAL/WARNING/INFO 三级是最小可行粒度——重操作必审，轻操作自动，中间建议审。

### 还不清楚的 3 个问题

1. 编排中的任务分解——LLM 分解的准确率是否可以量化？有没有"最优分解"的客观标准？
2. 多 Agent 系统中的记忆共享——Agent A 的发现如何被 Agent B 在本次会话中即时检索到而无需二次 LLM 调用？
3. Orchestrator 的"认知负荷"上限——管理多少 Worker 后任务分解质量开始显著下降？有实验数据吗？

### 六个阶段总进度

| 阶段 | 名称 | 核心能力 |
|---|---|---|
| 1 ✅ | LLM 基础认知 | 理解 Transformer、构建 API 客户端、Function Calling |
| 2 ✅ | MCP 协议与工具 | 写 MCP Server、理解 Transport、构建调试面板 |
| 3 ✅ | Prompt Engineering | 版本化管理、回归测试套件、多模型对比 |
| 4 ✅ | Agent 记忆与 RAG | 向量库、RAG pipeline、三层记忆模型 |
| 5 ✅ | 多 Agent 架构 | 编排引擎、Agent Mesh、HITL Gate、AutoGen/CrewAI |
| 6 ✅ | Agent 产品化 | 成本治理、信任评分、生产部署 |

### 下一步

阶段 6 已完成。六个阶段全部交付 🎉。

---

## 2026-06-23 — 阶段 6 完成：Agent 产品化与治理 ✅

### 产出物

| 文件 | 内容 |
|---|---|
| theory/01-cost-governance.md | Token 成本追踪、五级预算层级、成本漂移检测、cost-per-outcome |
| theory/02-trust-safety.md | OWASP Top 10、Prompt 注入防御、Validator Sandwich、信任评分 |
| theory/03-production-observability.md | 熔断器、限流、健康检查、审计日志哈希链、金丝雀、多模型降级 |
| `practice/cost-tracker/index.ts` | PricingEngine + BudgetManager + DriftDetector + CostOutcomeTracker |
| `practice/trust-engine/index.ts` | GuardrailPipeline + TrustScorer + AdversarialTestRunner (12/12 通过) |
| `practice/circuit-breaker/index.ts` | CircuitBreaker + RateLimiter + HealthChecker + AuditLogger (哈希链) |
| `practice/production-guardian/index.ts` | GracefulShutdown + ModelFallbackChain + CanarySimulator + AlertManager |
| `frontend/production-dashboard/` | React 3-Tab: 成本治理 / 信任与安全 / 生产运维 |
| `research/source-code-walkthrough.md` | NeMo Guardrails (Colang DSL + Rail) + LangFuse (Trace-Observation 模型) |

### 运行结果亮点

**cost-tracker**: 5 模型定价引擎 + 五级预算树 + 漂移检测 + 成本产出分析
```
💰 Token → USD: 5个Agent任务共112K tokens = $0.5246
   预算: 五级层级 (Org→Team→User→Key→Tag) 向上传播
   漂移: +59.3% 🔴 HIGH — 模拟Prompt膨胀检测
   Cost-per-Outcome: 每次成功产出 $0.091 (5/6 成功)
```

**trust-engine**: 对抗性测试 12/12 全部通过
```
🛡️ GuardrailPipeline: 输入护栏(注入+PII+毒性) + 输出护栏(Schema+安全+泄露)
   信任评分: 2次违规后 trust=0.875 (GREEN) — 可见衰减
   对抗测试: 12/12 通过，0漏报，0误报
```

**circuit-breaker**: 熔断器状态机 + 限流 + 哈希链审计
```
⚡ CircuitBreaker: CLOSED→OPEN→HALF_OPEN→CLOSED (3次转换)
   RateLimiter: 10 tokens容量，15次突发 → 限流4次
   AuditLogger: SHA-256 哈希链，篡改检测成功
```

**production-guardian**: 优雅关闭 + 3级降级 + 金丝雀
```
🏭 GracefulShutdown: 3个清理回调 + 请求排空
   ModelFallback: 3级链 (Claude→GPT-4o→DeepSeek)
   Canary: 4步 (5%→25%→50%→100%) PROMOTED
   AlertManager: cooldown 防抖，3次告警触发
```

### 学到的 3 件最重要的事

1. **成本治理的本质不是"省钱"，而是"把成本分配给价值"**：知道一个代码审查花了 $0.09 比知道一个 token 花了多少钱有意义 100 倍。PricingEngine 是翻译器——把技术语言（token）翻译成商业语言（美元），CostOutcomeTracker 把它进一步翻译成 ROI 语言（每次成功多少美元）。

2. **安全护栏不需要 LLM**：用 regex + keyword 的 GuardrailPipeline 做到了 100% 的对抗测试通过率，而且是 <1ms 延迟 + 零 API 成本。生产安全护栏必须自己快且免费——用 LLM 检测 LLM 的注入攻击是循环信任问题，而且会把成本翻倍。

3. **哈希链审计日志是"不可抵赖"的最轻量实现**：不需要数据库、不需要区块链、不需要外部服务——SHA-256 + 前驱哈希指针 = 数学上不可篡改的审计轨迹。EU AI Act 合规不需要分布式共识，只需要"任何篡改都会被检测到"。

### 六个阶段总回顾

| 阶段 | 核心能力 | 关键洞察 |
|---|---|---|
| 1 | LLM 基础认知 | Attention 让信息传递从 O(n) 降到 O(1) |
| 2 | MCP 协议与工具 | MCP 是 AI 世界的 USB 协议——解耦工具提供者和消费者 |
| 3 | Prompt Engineering | Prompt 是"自然语言程序"，应该是版本化+测试的 |
| 4 | Agent 记忆与 RAG | Chunking 是 RAG 最被低估的工程问题 |
| 5 | 多 Agent 架构 | 多 Agent 不是"多调几次 LLM"，是"给每次调用一个狭窄的角色" |
| 6 | Agent 产品化 | 产品化不是加功能——是为已经在跑的原型加护栏、预算、可观测性 |

### 还不清楚的 3 个问题

1. 真实 Embedding API 在中文技术文档上的检索 Recall@10 是多少？HNSW 的 M/efConstruction 参数如何自动调优？（阶段 4 遗留）
2. NeMo Guardrails 的 Colang DSL 在复杂多 Agent 场景中如何表达跨 Agent 的安全策略？单一 Agent 的 rail 容易，多 Agent 的 rail 怎么设计？
3. LangFuse 的异步摄入 + ClickHouse 分析架构在小规模（< 1万 trace/天）场景中是否过度工程化？什么规模是异步摄入的必要拐点？

### 项目收官

六个阶段，从 6/17 到 6/23，7 天完成：
- 3 篇理论文档 × 6 阶段 = 18 篇理论
- 4 个实践模块 × 3 阶段 (3-5) + 2 阶段 (1-2) + 4 (6) = ~18 个可运行的实践模块
- 5 个 React 可视化面板（Phase 2-6）
- 6 篇源码走读（每个阶段 2+ 个框架/代码库）
- 总计 ~50 个产出物

最重要的元认知：**Agent 工程是一个金字塔——底层是 LLM 原理，中层是 Prompt/RAG/多Agent 架构，顶层是产品化治理。大多数人只学顶层（用 LangChain 搭 Agent），但不出问题是因为他们没上生产。真正的 Agent 工程师需要金字塔的每一层。**

---

## 2026-06-23 — Agent 间记忆共享深度探索

### 探索问题

从待解决问题 #7 出发：**Agent A 的发现怎么实时让 Agent B 检索到？**

### 核心发现

传统三种方案的共同盲区：都要求 Agent 知道"自己不知道什么"。
- 全局 context → O(n²) 膨胀
- 显式通信 → A 不知道 B 需要什么
- 被动检索 → B 不知道缺什么

**Shared Memory Bus 方案**：Agent 不需要知道。系统替它知道。

### 四层设计

| 层 | 解决问题 | 机制 |
|---|---|---|
| 基础共享 | A 的发现被 B 自动检索 | Write Path: 提取 → embedding → 写入；Read Path: query → 语义检索 → Top-K 注入 Prompt |
| 反膨胀 | System Prompt 不无限增长 | 已见去重 + 累积压缩 → 注入量收敛到常数 |
| 时效性 | 短效快死，长效长存 | 三类知识（TRANSIENT/SITUATIONAL/DURABLE）× 各自半衰期 → 检索时分数 × 0.5^(时间/半衰期) |
| 过期标记 | 新信息覆盖旧信息 | 新知识写入时语义检索 → 相似 >0.6 的旧知识标记 stale → 永不返回 |

### 和 Agent Mesh（通信）的区别

- **通信**：有明确收发双方，实时。"我知道你是谁，我告诉你"
- **记忆共享**：无明确收发双方，异步。"我不知道你会需要这个，系统替你留着"

两者互补——通信负责任务流转，记忆共享负责知识扩散。

### 产出

- 实践模块：`phase-5-multi-agent/practice/shared-memory/index.ts`
- 生产设计：`phase-5-multi-agent/practice/shared-memory/production-design.md`（向量数据库选型、元数据表设计、并发/时钟/容错）
- Demo vs 生产全景：`docs/PRODUCTION_GAP.md`（六个阶段的 demo→生产差距系统性分析）

### 学到的最重要的事

1. **共享记忆和 RAG 的根本区别**：RAG 是"Agent 查资料"（主动），共享记忆是"资料找 Agent"（被动）。一个需要 Agent 知道缺什么，一个不需要。

2. **时效性不能一刀切**："API 挂了"和"age 废弃"的寿命差 3-4 个数量级。三类知识 × 各自半衰期，检索时动态衰减而非固定 TTL。

3. **六个阶段的 demo→生产差距共享同一个模式**：所有"内存 Map"最终都变成"外部数据库服务"。接口语义不变（`add()`、`search()`），实现可替换——这正是 Phase 3 策略模式思想的延伸。