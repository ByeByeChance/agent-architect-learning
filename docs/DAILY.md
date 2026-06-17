# 每日学习笔记

## 2026-06-17 — 项目初始化

### 完成
- 学习体系设计确认
- 阶段 1 项目脚手架搭建完成
- 14 个文件就位（理论 3 + Agent 实践 7 + 前端实践 3 + 源码 2）

### 待办
- [ ] 在 .env 中填入 API Key
- [ ] 阅读 Transformer 材料，写 Task 2 笔记
- [ ] 实验 tokenizer，写 Task 3 笔记

### 备注
理论笔记文件已建好，直接在里面填空就行。

---

## 2026-06-17 — 阶段 1 完成

### 学到的 3 件最重要的事
1. **Attention 是一步到位的**：信息传递 O(1) vs RNN O(n)，这是 Transformer 能规模化的根本
2. **Function Calling 是 LLM 连接现实的桥梁**：模型决定"调什么工具、什么参数、怎么整合结果"
3. **中文的 token 效率约为英文的 1.5-2 倍**：直接影响 API 成本和 context window 有效容量

### 还不清楚的 3 个问题
1. Embedding 向量具体怎么训练的？反向传播如何更新 Embedding Matrix？
2. RoPE 和正弦位置编码的具体差异和优劣？
3. DeepSeek 的 tokenizer 和 OpenAI 的 cl100k_base 到底差在哪？

### 阶段 2 想搞清楚什么
- Prompt 的版本化管理怎么做工程化？
- MCP 协议的本质是什么？怎么用 TypeScript 写一个完整的 MCP Server？
