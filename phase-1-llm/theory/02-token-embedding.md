# Token 与 Embedding

> 实验工具：https://tiktokenizer.vercel.app/
> 补充阅读：OpenAI Tokenizer 文档 https://platform.openai.com/tokenizer

## 1. 什么是 Token？

Token 是 LLM 处理文本的最小单位，不是"字"也不是"词"，介于两者之间。

**BPE (Byte Pair Encoding) 原理**：
1. 从字节级开始（每个字符 = 一个 token）
2. 统计所有相邻 token 对的频率
3. 最高频的一对合并为新 token
4. 重复直到达目标词汇量（GPT-4 约 10 万）

结果：高频词是完整 token（`the` → 1 个），低频词拆成子词（`tokenization` → `token` + `ization`）。

## 2. 为什么中文 token 数比英文多？

| 输入内容 | Token 数 | 原因 |
|---|---|---|
| "Hello, world!" | ~4-5 | 英文有空格分隔，每个词 ≈ 1 token |
| "你好，世界！" | ~6-8 | 中文无空格，每个字 ≈ 1-2 token |

**根本原因**：主流 tokenizer 训练数据以英文为主。BPE 合并时，英文高频词合并优先级更高。中文词频在训练语料中占比低，被拆得更碎。

**影响**：同样的语义内容，中文消耗 1.5-2x 的 token，意味着中文 API 成本更高、context window 有效容量更小。

## 3. Token → ID → Embedding 的流程

```
输入文字: "我学习 AI"
    ↓  Tokenizer
Token 列表: ["我", "学习", "AI"]
    ↓  查表
Token IDs:  [1234, 5678, 910]
    ↓  Embedding Matrix
向量序列:
  ID=1234 → [0.12, -0.34, 0.56, ...]  (d_model 维)
  ID=5678 → [0.78, 0.11, -0.45, ...]
  ID=910  → [-0.23, 0.67, 0.34, ...]
    ↓
输入 Transformer
```

Embedding Matrix 是形状 [vocab_size, d_model] 的可学习矩阵。GPT-3 的词表约 5 万、d_model=12288，即 50000×12288 的巨大参数表。

## 4. Embedding 做了什么？

Embedding 把离散的 token ID 映射到连续的、高维的向量空间。这个向量编码了语义信息。

**经典例子：king - man + woman ≈ queen**

在向量空间中做算术：
- king(国王) 向量 - man(男人) 向量 = 去除男性属性
- + woman(女人) 向量 = 加上女性属性
- 结果向量最接近 queen(女王) 向量

说明 Embedding 不仅记住了词的表层形式，还学到了词之间的语义关系和属性。语义相似的词在向量空间中距离更近。

## 5. Context Window（上下文窗口）

模型一次能"看到"的最大 token 数量。GPT-4 = 128K token（约 9 万英文词 / 6 万中文字）。

**为什么需要大上下文**：长文档分析、多轮对话、RAG（注入检索到的文档）。

**为什么不是越大越好**：
1. 注意力计算复杂度 O(n²)——上下文翻倍，计算量翻四倍
2. "Lost in the Middle" 效应：模型最关注开头和结尾，中间部分易被忽略
3. 成本：输入 token 也计费
4. 注意力稀释：窗口越大，每个 token 分到的注意力越少

大多数任务 4K-8K 就够，128K 是"有需要时可用"。
