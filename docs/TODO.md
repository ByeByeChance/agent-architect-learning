# 恢复指南 — 下次继续从这里开始

**当前进度**: 阶段 1-6 全部完成 🎉。项目收官。

## 已完成的

### 阶段 1 — LLM 基础认知 ✅

| 产出 | 位置 |
|---|---|
| Transformer/Attention 笔记 | `phase-1-llm/theory/01-transformer-attention.md` |
| Token/Embedding 笔记 | `phase-1-llm/theory/02-token-embedding.md` |
| LLM 能力边界笔记 | `phase-1-llm/theory/03-llm-capabilities-limits.md` |
| DeepSeek/OpenAI API 客户端 | `phase-1-llm/practice/agent/api-client/` |
| Temperature 实验 | `phase-1-llm/practice/agent/experiments/` |
| Prompt 测试（3/3 通过） | `phase-1-llm/practice/agent/prompt-lab/` |
| Function Calling | `phase-1-llm/practice/agent/function-calling/` |
| Design Token 体系 + 预览页 | `phase-1-llm/practice/frontend/design-tokens/` |
| Agent 组件架构设计 | `phase-1-llm/practice/frontend/component-architecture/` |
| API 文档精读 | `phase-1-llm/research/api-docs-notes.md` |
| Tokenizer 分析 | `phase-1-llm/research/tokenizer-analysis.md` |
| 源码走读 | `phase-1-llm/research/source-code-walkthrough.md` |

### 阶段 2 — MCP 协议与工具构建 ✅

| 产出 | 位置 |
|---|---|
| MCP 协议笔记 | `phase-2-mcp/theory/01-mcp-protocol.md` |
| Transport+安全笔记 | `phase-2-mcp/theory/02-mcp-security-transport.md` |
| Hello MCP Server | `phase-2-mcp/servers/hello-server/` |
| Weather MCP Server | `phase-2-mcp/servers/weather-server/` |
| File Search MCP Server | `phase-2-mcp/servers/file-search-server/` |
| Agent 调试面板 (React) | `phase-2-mcp/dashboard/` |
| Transport 源码分析 | `phase-2-mcp/research/mcp-transport-analysis.md` |
| MCP vs OpenAI Tools | `phase-2-mcp/research/mcp-vs-openai-tools.md` |
| 源码走读 | `phase-2-mcp/research/source-code-walkthrough.md` |
| RUM 方案 | `phase-2-mcp/practice/frontend/observability/` |

### 阶段 3 — Prompt Engineering 深入 ✅

| 产出 | 位置 |
|---|---|
| Few-shot/CoT 理论 | `phase-3-prompt-eng/theory/01-few-shot-cot.md` |
| System Prompt 设计 | `phase-3-prompt-eng/theory/02-system-prompt-design.md` |
| Prompt 测试方法论 | `phase-3-prompt-eng/theory/03-prompt-testing-methodology.md` |
| Prompt 版本仓库 + CLI | `phase-3-prompt-eng/practice/prompt-vault/` |
| 回归测试套件（20 用例） | `phase-3-prompt-eng/practice/test-suite/` |
| 多模型对比 Runner | `phase-3-prompt-eng/practice/multi-model-bench/` |
| Prompt 管理面板 (React 3-Tab) | `phase-3-prompt-eng/frontend/prompt-dashboard/` |
| Anthropic/OpenAI 最佳实践 | `phase-3-prompt-eng/research/anthropic-prompt-best-practices.md` |
| CoT/ReAct/Reflexion 论文 | `phase-3-prompt-eng/research/cot-react-papers.md` |
| 源码走读 (promptfoo/Anthropic/LangChain 逐行) | `phase-3-prompt-eng/research/source-code-walkthrough.md` |
| 🔧 api-client 策略模式重构 | `phase-3-prompt-eng/practice/api-client/` |
| 🔧 prompt-vault validate 增强 (dummy渲染+smoke test) | `phase-3-prompt-eng/practice/prompt-vault/prompt-registry.ts` |
| 🔧 test-suite 增强 (graderError+score+llmRubric) | `phase-3-prompt-eng/practice/test-suite/test-runner.ts` |

### 阶段 4 — Agent 记忆与 RAG 🔄

| 产出 | 位置 |
|---|---|
| Embedding 与向量检索理论 | `phase-4-rag-memory/theory/01-embedding-vector-search.md` |
| RAG 架构设计理论 | `phase-4-rag-memory/theory/02-rag-architecture.md` |
| 上下文与记忆管理理论 | `phase-4-rag-memory/theory/03-context-memory-management.md` |
| ✅ 向量库实践 | `phase-4-rag-memory/practice/vector-db/` |
| ✅ RAG pipeline 实践 | `phase-4-rag-memory/practice/rag-pipeline/` |
| ✅ 上下文压缩实践 | `phase-4-rag-memory/practice/context-compressor/` |
| ✅ 记忆管理器实践 | `phase-4-rag-memory/practice/memory-manager/` |
| ✅ 前端可视化面板 | `phase-4-rag-memory/frontend/rag-dashboard/` |
| ✅ 源码走读 | `phase-4-rag-memory/research/source-code-walkthrough.md` |

### 阶段 5 — 多 Agent 架构 ✅

| 产出 | 位置 |
|---|---|
| 多 Agent 拓扑模式理论 | `phase-5-multi-agent/theory/01-multi-agent-topology.md` |
| Agent 编排与协调理论 | `phase-5-multi-agent/theory/02-orchestration-coordination.md` |
| 失败恢复 + HITL + 可观测性 | `phase-5-multi-agent/theory/03-failure-recovery-hitl.md` |
| ✅ Orchestrator 编排引擎 | `phase-5-multi-agent/practice/orchestrator/` |
| ✅ Agent Mesh 通信 | `phase-5-multi-agent/practice/agent-mesh/` |
| ✅ HITL Gate 审批 | `phase-5-multi-agent/practice/hitl-gate/` |
| ✅ Context 预算管理 | `phase-5-multi-agent/practice/context-budget/` |
| ✅ 前端 Agent 面板 | `phase-5-multi-agent/frontend/agent-dashboard/` |
| ✅ AutoGen/CrewAI 源码走读 | `phase-5-multi-agent/research/source-code-walkthrough.md` |

### 阶段 6 — Agent 产品化与治理 ✅

| 产出 | 位置 |
|---|---|
| 成本治理理论 | `phase-6-production/theory/01-cost-governance.md` |
| 信任与安全理论 | `phase-6-production/theory/02-trust-safety.md` |
| 生产部署与可观测性理论 | `phase-6-production/theory/03-production-observability.md` |
| ✅ Cost Tracker | `phase-6-production/practice/cost-tracker/` |
| ✅ Trust Engine | `phase-6-production/practice/trust-engine/` |
| ✅ Circuit Breaker | `phase-6-production/practice/circuit-breaker/` |
| ✅ Production Guardian | `phase-6-production/practice/production-guardian/` |
| ✅ 前端 Production Dashboard | `phase-6-production/frontend/production-dashboard/` |
| ✅ NeMo Guardrails/LangFuse 源码走读 | `phase-6-production/research/source-code-walkthrough.md` |

## 下次继续

**项目完成！六个阶段全部交付。**

回顾与展望：
- 阶段 1-2 构建了 Agent 基础能力（LLM → MCP 工具）
- 阶段 3-4 解决了 Agent 认知瓶颈（Prompt → RAG 记忆）
- 阶段 5 打开了多 Agent 协作空间（编排 → Mesh → HITL）
- 阶段 6 弥合了原型到产品的最后一公里（成本 → 信任 → 生产）

可能的进阶方向：
- 真实 MCP Client 集成（将 Dashboard Chat tab 接入真实 MCP transport）
- 真实 Embedding API 替换 MockEmbedder（BGE-M3 或 text-embedding-3-small）
- 本地模型部署（Ollama + 量化模型）替代云端 API
- Agent 间记忆共享（Agent A 的发现实时被 Agent B 检索）
- Prompt 版本 diff 的语义判断（逻辑等价但措辞不同的自动识别）

## 待解决问题

1. MCP Client 怎么实现？Dashboard Chat tab 怎么接入真实的 MCP？
2. SSE Transport 怎么在 Web Dashboard 中落地？
3. 多个 MCP Server 同时运行时，Agent 怎么路由 tool call？
4. Prompt 版本 diff 如何自动化？如何判断两个版本的语义差异？
5. LLM-as-Judge 的可靠性如何量化和校准？
6. 多 Agent 系统中，Orchestrator 单点故障如何优雅降级？
7. ✅ Agent 间记忆共享——Shared Memory Bus 方案已实现 `phase-5-multi-agent/practice/shared-memory/`
8. （新）真实 Embedding API 在中文技术文档上的检索 Recall@10 是多少？
9. （新）NeMo Guardrails modify 模式如何集成到 TypeScript 护栏中？
10. （新）LangFuse 的异步摄入模式如何在不引入外部依赖的情况下实现？

## 环境备注

- Node: `source ~/.nvm/nvm.sh && nvm use v20.18.3`
- Python: 不用；TypeScript/Node.js 为主
- API: DeepSeek（配置在 `phase-1-llm/.env`）
- Dashboard 启动: `cd phase-2-mcp/dashboard && npx vite --port 5199`
