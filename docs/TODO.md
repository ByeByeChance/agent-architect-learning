# 恢复指南 — 下次继续从这里开始

**当前进度**: 阶段 1、2 全部完成。下一步 → 阶段 3（Prompt Engineering 深入）

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

## 下次继续

**启动阶段 3 — Prompt Engineering 深入**

参考设计文档：`docs/superpowers/specs/2026-06-17-agent-architect-learning-design.md`

阶段 3 方向：
- Prompt 版本化管理的工程实践
- Prompt 回归测试套件
- 多模型 Prompt 效果对比（DeepSeek vs OpenAI vs Claude）
- System Prompt 模板系统

## 待解决问题

1. MCP Client 怎么实现？Dashboard Chat tab 怎么接入真实的 MCP？
2. SSE Transport 怎么在 Web Dashboard 中落地？
3. 多个 MCP Server 同时运行时，Agent 怎么路由 tool call？

## 环境备注

- Node: `source ~/.nvm/nvm.sh && nvm use v20.18.3`
- Python: 不用；TypeScript/Node.js 为主
- API: DeepSeek（配置在 `phase-1-llm/.env`）
- Dashboard 启动: `cd phase-2-mcp/dashboard && npx vite --port 5199`
