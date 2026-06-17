 # 前端 → Agent 体验架构师 学习体系设计

 **版本**: 0.1
 **日期**: 2026-06-17
 **状态**: Draft

 ---

 ## 总纲

 ### 目标

 从"前端开发工程师"转型为 **"Agent 体验架构师"**——即能用前端架构思维设计 AI Agent 系统的复合型角色。不做纯后端架构师，不做纯 AI 工程师，而是占据"前端体验 + Agent 系统设计"这个交叉地带。

 ### 核心原则

 1. **融合而非替代**：前端架构能力不抛弃，嫁接到 Agent 领域。每阶段同时推进前端和 Agent。
 2. **理论 + 实践 + 源码**：三条线并行，不纸上谈兵，不只知其然。
 3. **渐进式递进**：六个阶段从基础到精深，每阶段有明确产出。
 4. **文档沉淀一切**：讨论、决策、笔记、设计全部文档化，可回溯。

 ### 当前状态

 - **阶段**: 设计确认中
 - **下一步**: 确认设计 → 写 PLAN → 进入阶段 1

 ### 技术栈定位

 | 层级 | 技术 | 角色 |
 |---|---|---|
 | 前端层 | TypeScript/React · 组件架构 · 可视化 · 性能 | 主攻 |
 | MCP 工具层 | TypeScript MCP SDK · Node.js | 构建 |
 | Agent 推理层 | Claude/OpenAI API · 上下文管理 · RAG · 记忆 | 逐步自建 |
 | 模型层 | Claude / GPT 等 LLM | 使用 API |

 ---

 ## 学习框架

 ### 六个阶段

 每个阶段四条线并行：

 | # | 阶段 | 理论 (📖) | 前端实践 (🖥️) | Agent 实践 (🤖) | 源码溯源 (🔍) |
 |---|---|---|---|---|---|
 | 1 | LLM 基础认知 | Transformer · Attention · Token/Embedding · LLM 能力边界 | 组件库设计规范 · Design Token 体系 · 前端架构分层 | API 对话 · temperature/top_p · System Prompt · Function Calling | OpenAI/Anthropic API 文档 · tokenizer 原理 |
 | 2 | Prompt Engineering 深入 | Few-shot/CoT · System Prompt 设计 · Schema 约束 · 测试方法论 | 微前端架构 · 状态管理架构 (Zustand/XState) | Prompt 测试套件 · 版本化管理 · 结构化输出验证 | Prompt Engineer 角色 · Anthropic 最佳实践 |
 | 3 | MCP 协议与工具构建 | MCP 协议规范 · Tool/Resource/Prompt · Transport · 安全模型 | 前端可观测性 (Sentry/RUM) · 性能监控面板 | TS MCP Server · Agent 调试面板 · Tool call 可视化 · SSE/Streaming | MCP TS SDK 源码 · Transport 实现 · MCP Builder 角色 |
 | 4 | Agent 记忆与 RAG | Embedding · 向量检索 · RAG 架构 · 上下文管理 · 记忆策略 | 大屏/实时数据可视化 · WebSocket 架构 | 本地向量库 · RAG pipeline · 上下文压缩 · 记忆管理 | LangChain/LlamaIndex 核心 · FAISS/Chroma 源码 |
 | 5 | 多 Agent 架构 | 拓扑模式 · 编排模式 · 失败恢复 · HITL · 可观测性 · 上下文预算 | Agent 可视化面板 · 工作流编辑器 · 拖拽编排 UI | Orchestration 层 · 多 agent 协作 · HITL 审批 · 失败降级 | Multi-Agent Systems Architect 角色 · AutoGen/CrewAI |
 | 6 | Agent 产品化与治理 | 成本治理 · 信任评分 · 身份认证 · 证据链 · 生产部署 | SSR/SSG 架构决策 · Edge/Serverless · 前端 CI/CD | 完整 Agent 产品交付 · 性能压测 · 安全加固 · 成本 Dashboard | Agentic Identity Trust · Autonomous Optimization Architect · Workflow Architect |

 ### 关键架构决策 (ADR)

 **ADR-001: TypeScript 而非 Python 作为主力语言**

 - 决策：MCP Server、前端、编排层均使用 TypeScript
 - 理由：前端 + MCP 同一语言，认知负担最小；MCP 官方 TS SDK 成熟
 - 代价：Python AI 生态（训练、数据处理）需要时再补，不作为主线

 **ADR-002: 先 MCP 再自建 Agent 推理层**

 - 决策：阶段 1-3 使用 Claude/OpenAI API 作为推理层，阶段 4 开始自建上下文管理和 RAG
 - 理由：先理解 agent 怎么用工具，再理解 agent 怎么思考
 - 代价：初期对 agent 底层理解较浅

 **ADR-003: 前端架构能力不单独成阶段**

 - 决策：前端架构能力融入每个阶段的"前端实践"列，不设独立阶段
 - 理由：避免前后端割裂感；Agent 产品本身就是前端架构的应用场景

 ---

 ## 文档体系

 所有文件放在 `docs/` 目录下：

 ```
 docs/
 ├── README.md                    # 总纲（本文件精简版）
 ├── PLAN.md                      # 总体计划 · 里程碑
 ├── TODO.md                      # 当前阶段任务清单
 ├── DAILY.md                     # 每日学习笔记
 ├── CONVERSATION_LOG.md          # 讨论记录 · 决策 · 共识
 ├── superpowers/
 │   └── specs/                   # 架构设计文档
 │       └── 2026-06-17-agent-architect-learning-design.md
 └── design-docs/                 # 各阶段产出物
     ├── phase-1-llm-foundation/
     ├── phase-2-prompt-engineering/
     ├── phase-3-mcp/
     ├── phase-4-rag-memory/
     ├── phase-5-multi-agent/
     └── phase-6-production/
 ```

 ---

 ## 参考角色（来自 agent-fleet 118 个角色）

 以下角色定义作为学习框架的理论来源，贯穿各阶段：

 | 角色 | 关联阶段 | 用途 |
 |---|---|---|
 | Frontend Developer | 全部 | 前端实践列的基准能力定义 |
 | Prompt Engineer | 阶段 2 | Prompt 设计与测试方法论 |
 | MCP Builder | 阶段 3 | MCP Server 开发规范 |
 | AI Engineer | 阶段 4 | RAG、向量库、模型部署 |
 | Multi-Agent Systems Architect | 阶段 5 | Agent 拓扑、编排、失败恢复 |
 | Agents Orchestrator | 阶段 5 | Agent 调度流水线 |
 | Workflow Architect | 阶段 5-6 | 系统路径映射、状态机 |
 | Agentic Identity & Trust | 阶段 6 | Agent 身份认证、信任评分 |
 | Autonomous Optimization Architect | 阶段 6 | 成本治理、自优化路由 |
 | Software Architect | 全部 | 系统设计思维、ADR、权衡分析 |
 | Backend Architect | 阶段 4-6 | API 设计、数据库、可观测性 |

 ---

 ## 讨论共识记录

 以下为本次讨论中达成的关键共识：

 1. 方向确定为"前端体验 + Agent 系统设计"，不做传统后端架构师
 2. 不抛弃前端原有积累，而是嫁接到 Agent 领域
 3. 离职状态，使用公共 API (Claude/OpenAI) 作为 Agent 推理后端
 4. 不满足于使用现成 API，要自建上下文管理、记忆、RAG
 5. 理论 + 实践 + 源码三条线缺一不可
 6. 所有讨论和变化全部沉淀为文档
 7. 学习是渐进式，六阶段逐步推进
 8. TypeScript/Node.js 作为主力语言，Python 能读即可
