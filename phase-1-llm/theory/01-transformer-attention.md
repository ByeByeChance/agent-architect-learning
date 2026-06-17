# Transformer 与 Attention 机制

> 阅读材料：
> 1. 图解 Transformer（中文，30 分钟）https://jalammar.github.io/illustrated-transformer/
> 2. 3Blue1Brown 视频（B站有中文字幕）https://www.bilibili.com/video/BV1TZ421j7Bd
> 3. "Attention Is All You Need" 论文 https://arxiv.org/abs/1706.03762

## 1. 为什么要有 Attention？

RNN/LSTM 处理序列时逐个 token 顺序计算，每一步依赖上一步的隐藏状态。这导致两个致命问题：

**长距离依赖衰减**：当序列很长时（如 100 个 token），开头的信息经过 100 步传递后被严重稀释，模型"忘记"了远距离的上下文关系。

**无法并行训练**：每步依赖前一步，GPU 只能串行计算，训练极慢。

Attention 让每个输出位置直接"看到"输入序列的所有位置，计算出相关性权重。信息传递路径从 O(n) 降到了 O(1)，不再需要层层传递。同时所有位置计算互相独立，可以完全并行。

## 2. Self-Attention 怎么算？

核心公式：Attention(Q,K,V) = softmax(QKᵀ/√dₖ)V

**Q、K、V 是什么？**
- Q (Query)：来自"当前这个词"——"我在找什么？"
- K (Key)：来自"所有词"——"我有什么特征？"
- V (Value)：来自"所有词"——"如果有人关注我，我传递什么信息？"

三者通过可学习的权重矩阵从输入投影得到：Q = X·Wq, K = X·Wk, V = X·Wv

**计算步骤：**
1. Score：Q 与每个 K 点积，得相关性分数
2. Scale：除以 √dₖ，防止点积过大导致 softmax 梯度消失
3. Softmax：分数转为概率分布（总和=1）
4. Weighted Sum：用权重对 V 加权求和，得最终输出

## 3. Multi-Head Attention 解决了什么？

单头 Attention 只学一种关注模式。但语言是丰富的——语法关系、语义关系、指代关系各不相同。

Multi-Head = 多组并行的 Self-Attention，每组有自己的 Wq/Wk/Wv，可以学不同模式：
- Head 1：关注主语-谓语语法关系
- Head 2：关注代词前指（"它"指谁）
- Head 3：关注语义相似性

论文用 8 个 head，每个维度降至 d_model/8。最后拼接（concat）并线性投影。

## 4. Transformer 的整体结构

**Encoder**：处理输入序列。Self-Attention 看整个输入 → Feed-Forward 做非线性变换 → 输出含上下文信息的向量序列。

**Decoder**：生成输出。Masked Self-Attention 只看当前位置之前 → Cross-Attention（Q 来自 Decoder、K/V 来自 Encoder）参考输入 → Feed-Forward → 输出下一个词的概率。

**Positional Encoding**：Transformer 把词"平铺"同时看，不知道顺序。位置编码给每个位置注入唯一向量，让模型知道词序。论文用正弦/余弦函数，现代模型（GPT）多用 RoPE（可学习位置编码）。

## 5. 为什么 Transformer 能规模化？

**并行训练**：Self-Attention 所有位置同时计算，数千块 GPU 并行，万亿参数也训得动。

**梯度稳定性**：残差连接 + Layer Normalization 防止深层网络的梯度消失/爆炸，可堆叠几十上百层。

**Scaling Law**：模型规模、数据量、计算量与性能之间呈可预测的幂律关系。"大力出奇迹"有数学支撑。

## 6. 怎样向外行人解释 ChatGPT 为什么"懂"你？

ChatGPT 读遍了互联网上几乎所有公开文本，学会了词与词之间的关联模式——"太阳"后面大概率跟"升起来"，"我饿了"后面大概率跟"去吃饭"。当你问它问题时，它不是在"思考"，而是在巨大知识库中找最匹配的文本模式，然后一个词一个词拼出合理回答。没有意识，没有感受，只是极其精密的模式匹配——但这个能力强大到能通过大学考试。

## 自测答案

1. **Q、K、V 从哪里来？** 都来自输入向量 X，通过三个不同的权重矩阵 Wq/Wk/Wv 线性投影得到。
2. **Attention 比 RNN 好在哪？** Attention 信息传递 O(1) vs RNN O(n)；Attention 可完全并行训练。
3. **Multi-Head 的 Multi 是什么意思？** 多组并行的注意力"头"，各学不同语义关系，类似多个专家同时审阅。
4. **Positional Encoding 解决什么？** Transformer 无序列感，位置编码注入位置信息，让模型知道词序。
5. **Decoder-only vs Encoder-Decoder？** Encoder-Decoder（如原始 Transformer、T5）有编码和译码两部分，适合翻译。Decoder-only（如 GPT）只有解码器，通过预测下一个词生成文本，训练更简单，是主流大模型架构。
