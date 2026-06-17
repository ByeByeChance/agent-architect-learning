# Tokenizer 分析

## BPE (Byte Pair Encoding) 原理

BPE 是压缩思想在 NLP 中的应用：

1. 初始状态：每个字符是一个独立 token（包括空格和标点）
2. 扫描整个训练语料，统计所有相邻 token 对的出现频次
3. 找到最高频的一对，合并成一个新 token 加入词表
4. 用新 token 替换语料中所有这个 token 对
5. 重复步骤 2-4，直到词表达到预定大小（如 50000）

结果：常见组合（如 "the"、"ing"、"tion"）变成单一 token，罕见组合留在字符级。

## 实验数据

使用 tiktoken (cl100k_base 编码，GPT-4 的 tokenizer)：

| 输入 | Token 数 | 分析 |
|---|---|---|
| "Hello, world!" | 4 | `Hello` `,` ` world` `!` — 单词+标点 |
| "你好，世界！" | 7 | 中文每个字基本 1-2 token，标点独立 |
| "Attention is a concept..." | 16 | 英文平均 0.75 token/词 |
| 中文段落 | 12 | 12 个中文字 = 12 token，字符级切分 |
| 中英混排 "self attention机制" | 11 | `self` ` attention` 各 1 token，中文逐字 |
| `[{data:1}]` | 5 | 每个符号都成独立 token |

## 关键发现

1. **中文 token 效率约为英文的 1.5-2 倍**：同样的语义内容，中文消耗更多 token
2. **JSON/代码的标点符号占大量 token**：每个括号、引号、冒号都是独立 token
3. **BPE 会"记住"训练数据中常见的字串**：如 "self"、"attention"、"ing" 是高频组合，直接成了独立 token
4. **DeepSeek 使用的是自己的 tokenizer**：虽然 API 兼容 OpenAI，但 token 化方式不同。因此计算 token 数最好用 DeepSeek 官方工具
5. **成本影响**：1000 字的输入 ≈ 中文 1500 token、英文 900 token。使用中文的成本大约是英文的 1.7 倍
