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
