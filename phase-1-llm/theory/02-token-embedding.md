# Token 与 Embedding

> 实验工具：https://tiktokenizer.vercel.app/
> 补充阅读：OpenAI Tokenizer 文档 https://platform.openai.com/tokenizer

## 1. 什么是 Token？

[BPE tokenization 原理——用你自己的话说]

## 2. 为什么中文 token 数比英文多？

[实验数据放这里——写具体数字对比]

| 输入内容 | Token 数 | 观察 |
|---|---|---|
| "Hello, world!" | 5 | 1, 13225, 11, 2375, 18313 |
| "你好，世界！" | 6 | 1, 177519, 979, 28428, 3393, 1 |
| Attention is a concept that helped improve the performance of neural machine translation applications.  | 16 | 80207, 382, 261, 8496, 484, 12628, 8400, 290, 6198, 328, 58480, 7342, 24005, 9391, 13, 220 |
| 这是一个中文段落，我正在学习自注意力机制 | 12 | 135398, 22912, 10667, 27561, 31803, 40824, 70104, 64550, 6912, 48205, 11343, 110781 |
| 这是一个中文段落，我正在学习self attention机制 | 11 | 135398, 22912, 10667, 27561, 31803, 40824, 70104, 64550, 1156, 8684, 110781 |
| [{data:1}] | 5 | 117331, 1074, 25, 16, 53940 |

## 3. Token → ID → Embedding 的流程

[流程图：输入文字 → tokenizer → token IDs → embedding matrix → 向量]
答：输入文字会被 tokenizer 处理成 token IDs，然后根据 token IDs 从 embedding matrix 中获取对应的向量表示。

## 4. Embedding 做了什么？

[高维向量表示语义——"国王-男人+女人≈女王"说明什么？]
答：Embedding 表示了单词的语义信息，使模型能够理解单词之间的关系。"国王-男人+女人≈女王" 表示 "国王" 是 "男人" 的对应关系，而 "女王" 是 "女人" 的对应关系。

## 5. Context Window（上下文窗口）

[什么是 context window？为什么 GPT-4 有 128K？为什么不是越大越好？]
答：Context Window 是模型在处理输入序列时，考虑的上下文范围。GPT-4 有 128K 的上下文窗口，这是为了处理长文本。不是越大越好，因为模型的参数量会增加，计算成本也会增加。

---
