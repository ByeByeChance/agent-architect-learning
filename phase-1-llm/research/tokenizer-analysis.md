# Tokenizer 分析

> 实验工具：tiktoken (npm install tiktoken)

## BPE (Byte Pair Encoding) 原理

[用你自己的话解释 BPE 训练过程]

---

## 实验数据

| 输入 | Token 数 | 观察 |
|---|---|---|
| "Hello, world!" | | 每个单词 ≈ 1 token |
| "你好，世界！" | | 每个汉字 ≈ 1-2 tokens |
| JSON: {"name":"test"} | | 标点和大括号各占 token |
| 一段英文 | | |
| 一段中文 | | |

---

## 关键发现

1. 中文的 token 效率大约比英文低多少倍？
2. 代码/JSON 中什么字符消耗最多 token？
3. [你的其他发现]

---
