# Transformer 与 Attention 机制

> 阅读材料：
> 1. 图解 Transformer（中文，30 分钟）
>    https://jalammar.github.io/illustrated-transformer/
> 2. 3Blue1Brown 视频：Attention 可视化讲解（前 15 分钟，中文字幕）
>    B 站：https://www.bilibili.com/video/BV1TZ421j7Bd
>    YouTube：https://www.youtube.com/watch?v=eMlx5fFNoYc
> 3. "Attention Is All You Need" 论文
>    https://arxiv.org/abs/1706.03762

## 1. 为什么要有 Attention？

[不用 Attention 时 RNN/LSTM 有什么问题？长距离依赖、并行计算困难]
答：attention的引入可以提升神经网络翻译文本的能力，尤其是在长文本处理中。有助于模型理解文本中的长距离依赖关系。并且，attention机制允许模型关注文本中的不同部分，从而提高模型的翻译能力。

## 2. Self-Attention 怎么算？

[Q、K、V 分别是什么？它们怎么来的？计算步骤：score → softmax → weighted sum]
答：Q、K、V 分别是查询、键值和值向量。它们的维度是相同的，通常等于模型的隐藏层维度。计算步骤如下：
1. 计算查询向量与键值向量的点积（score）。
2. 对 score 进行 softmax 激活函数，得到注意力权重。
3. 用注意力权重加权求和，得到最终的输出向量。

## 3. Multi-Head Attention 解决了什么？

[为什么需要多个 head？不同的 head 关注什么不同的东西？]
答：多头注意力机制允许模型关注文本中的不同部分，从而提高模型的翻译能力。每个 head 都独立计算注意力权重，最后将所有 head 的输出拼接起来，得到最终的输出向量。

## 4. Transformer 的整体结构

[Encoder 和 Decoder 各做什么？Positional Encoding 为什么需要？]
答：Encoder负责处理输入序列，Decoder负责处理输出序列。Positional Encoding 用于为模型提供位置信息，帮助模型理解序列中的位置关系。

## 5. 为什么 Transformer 能规模化？

[并行训练、梯度稳定性、scaling law——用你自己的理解说]
答：因为Transformer可以使得模型并行进行训练，大大提升了模型的训练效率。并且Transformer的梯度稳定性也好，防止模型在训练过程中梯度消失或爆炸，从而提高模型的训练稳定性。scaling law 也使得Transformer模型能够方便地进行规模化训练。

## 6. 我的理解校验

[用一段话向非技术朋友解释 ChatGPT 为什么会"懂"你的问题]
答：ChatGPT 通过使用 attention 机制，能够理解文本中的长距离依赖关系，从而生成更准确的回答。

---

## 自测（回答 4/5 即通过）

1. Q、K、V 是从哪里来的？
答：Q、K、V 分别是查询、键值和值向量。它们的维度是相同的，通常等于模型的隐藏层维度。是从输入序列中提取的。
2. 为什么 Attention 比 RNN 好？
答：attention机制允许模型关注文本中的不同部分，从而提高模型的翻译能力。并且，attention机制允许模型并行计算，从而提高模型的计算效率。RNN/LSTM 无法并行计算，只能顺序计算，从而导致计算效率低。
3. Multi-Head Attention 的 "Multi" 是什么意思？
答：Multi-Head Attention 指的是使用多个 head 来计算注意力权重，从而提高模型的翻译能力。
3. 为什么需要多个 head？
答：不同的 head 关注文本中的不同部分，从而提高模型的翻译能力。
4. Positional Encoding 解决什么问题？
答：Positional Encoding 解决了决了 RNN/LSTM 无法理解序列中位置信息的问题。
5. Decoder-only 和 Encoder-Decoder 的区别是什么？
答：Decoder-only 模型只负责处理输出序列，不负责处理输入序列。Encoder-Decoder 模型负责负责处理输入序列和输出序列。

---
