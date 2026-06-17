# 讨论记录

## 2026-06-17 — 职业方向讨论

### 背景
用户是前端开发工程师，从 GitHub 下载了 118 个 agent-fleet 角色，希望分析前端/架构师相关的角色，并规划职业发展方向。当前处于离职状态，目标是以"前端体验 + Agent 系统设计"为差异化方向转型。

### 关键决策

| # | 决策 | 理由 |
|---|---|---|
| ADR-001 | TypeScript 作为主力语言 | 前端+MCP同一语言，认知负担最小 |
| ADR-002 | 先 MCP 再自建 Agent 推理层 | 先理解工具调用，再理解推理 |
| ADR-003 | 前端架构不单独成阶段 | 融入每个阶段，避免割裂 |
| ADR-004 | 使用公共 API 作为 Agent 后端 | 离职状态无需依赖团队后端 |

### 浏览器可视化记录
- [学习框架 v2](superpowers/specs/screenshots/2026-06-17-learning-framework.html)
- [系统架构](superpowers/specs/screenshots/2026-06-17-architecture.html)
- [方案对比](superpowers/specs/screenshots/2026-06-17-approaches.html)

### 产出物
- [x] 设计文档：`docs/superpowers/specs/2026-06-17-agent-architect-learning-design.md`
- [x] 学习框架可视化（浏览器 companion → 已沉淀到 screenshots/）
- [x] PLAN.md
- [x] README.md（总纲）
- [x] Phase 1 实施计划：`docs/superpowers/plans/2026-06-17-phase-1-llm-foundation.md`

### 下一步（待用户确认）
执行阶段 1 实施计划（15 个 Task）。
