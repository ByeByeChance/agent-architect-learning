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

## 2. Self-Attention 怎么算？

[Q、K、V 分别是什么？它们怎么来的？计算步骤：score → softmax → weighted sum]

## 3. Multi-Head Attention 解决了什么？

[为什么需要多个 head？不同的 head 关注什么不同的东西？]

## 4. Transformer 的整体结构

[Encoder 和 Decoder 各做什么？Positional Encoding 为什么需要？]

## 5. 为什么 Transformer 能规模化？

[并行训练、梯度稳定性、scaling law——用你自己的理解说]

## 6. 我的理解校验

[用一段话向非技术朋友解释 ChatGPT 为什么会"懂"你的问题]

---

## 自测（回答 4/5 即通过）

1. Q、K、V 是从哪里来的？
2. 为什么 Attention 比 RNN 好？
3. Multi-Head Attention 的 "Multi" 是什么意思？
4. Positional Encoding 解决什么问题？
5. Decoder-only 和 Encoder-Decoder 的区别是什么？

---
