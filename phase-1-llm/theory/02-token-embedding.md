# Token 与 Embedding

> 实验工具：https://tiktokenizer.vercel.app/
> 补充阅读：OpenAI Tokenizer 文档 https://platform.openai.com/tokenizer

## 1. 什么是 Token？

[BPE tokenization 原理——用你自己的话说]

## 2. 为什么中文 token 数比英文多？

[实验数据放这里——写具体数字对比]

| 输入内容 | Token 数 | 观察 |
|---|---|---|
| "Hello, world!" | | |
| "你好，世界！" | | |
| 一段英文段落 | | |
| 一段中文段落 | | |
| 中英混排 | | |
| JSON 代码 | | |

## 3. Token → ID → Embedding 的流程

[流程图：输入文字 → tokenizer → token IDs → embedding matrix → 向量]

## 4. Embedding 做了什么？

[高维向量表示语义——"国王-男人+女人≈女王"说明什么？]

## 5. Context Window（上下文窗口）

[什么是 context window？为什么 GPT-4 有 128K？为什么不是越大越好？]

---
