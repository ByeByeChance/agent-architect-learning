# Embedding 与向量检索

> 核心问题：LLM 只能处理 token 序列，如何让它在海量文档中找到"语义相关"的内容？答案是 **Embedding（向量化）** + **向量检索（Vector Search）**。

---

## 1. Embedding：把文本变成数字

### 为什么需要 Embedding？

LLM 的 context window 有限。你不能把所有知识都塞进 prompt。解决办法：**先检索相关知识，再喂给 LLM**。但如何检索"语义相关"而不仅仅是"关键词匹配"？

关键洞察：**把文本映射到高维向量空间，语义相近的文本向量距离就近**。

```
"猫是一种宠物"   → [0.23, -0.45, 0.78, ..., 0.12]  (1536维)
"狗是一种宠物"   → [0.21, -0.43, 0.80, ..., 0.15]  (距离近 ✅)
"今天下雨了"     → [-0.67, 0.32, -0.11, ..., -0.54] (距离远 ✅)
```

### Embedding 模型不是 LLM

| | LLM (Generator) | Embedding Model (Encoder) |
|---|---|---|
| 角色 | 生成文本 | 编码文本为向量 |
| 架构 | Decoder-only (GPT) | Encoder-only (BERT) 或 dual-encoder |
| 输出 | token 序列 | 固定长度向量 |
| 代表 | GPT-4, Claude, DeepSeek | text-embedding-3, BGE, Jina |
| 参数量 | 数百B-数T | 数百M-数B |
| 延迟 | 高 | 低（通常 < 100ms） |

**关键认知**：Embedding 模型小得多，因为只需要"理解"文本而不是"生成"文本。

### 常用 Embedding 模型

| 模型 | 维度 | 特点 |
|---|---|---|
| OpenAI text-embedding-3-small | 512/1536 | 性价比高，支持维度截断 |
| OpenAI text-embedding-3-large | 256/1024/3072 | 性能最强，MTEB 基准最高 |
| BGE-M3 (BAAI) | 1024 | 开源，支持多语言+稀疏+稠密 |
| BGE-Large (BAAI) | 1024 | C-MTEB 中文排名第一梯队 |
| Jina embeddings v3 | 1024 | 支持任务特定 LoRA，长文本 |
| Cohere Embed v3 | 1024 | 分类和检索双优 |

**选型建议**：
- 中文场景首选 BGE-M3（开源、免费、效果好）
- 英文+生产环境用 text-embedding-3-small（便宜、稳定）
- 多语言+长文本用 Jina v3

### Embedding 生成流程

```
输入文本 → Tokenizer → Token IDs → Encoder Model → 向量
                                                    ↓
"你好世界" → [123, 456, 789] → BGE-M3 → [0.12, -0.34, ..., 0.78]
                                              ↓
                                        Mean Pooling
                                        (取每个 token
                                        向量的平均)
                                              ↓
                                       [0.15, -0.28, ..., 0.72]
                                       (1024 维最终向量)
```

**Pooling 策略**是关键细节：
- **Mean Pooling**：所有 token 向量的均值，最常用
- **CLS Token**：取第一个 token 的输出，BERT 风格
- **Max Pooling**：取每个维度的最大值，对关键词检索更敏感
- **Last Token**：取最后一个 token，LLM-based embedding 常用

---

## 2. 向量空间与相似度

### 三种相似度度量

**余弦相似度（Cosine Similarity）**——最常用
```
cos(θ) = A·B / (||A|| × ||B||)

取值范围：[-1, 1]（1 = 完全相同方向，0 = 正交，-1 = 完全相反）
```

优点是**对向量长度不敏感**——两篇文章长度不同但语义相同，余弦相似度仍然高。这是 RAG 的默认选择。

**欧氏距离（Euclidean Distance）**
```
d(A,B) = √(Σ(Ai - Bi)²)

取值范围：[0, ∞)（越小越相似）
```

对向量长度敏感。如果 norm 很重要（比如你故意让"重要文档"的 embedding norm 更大），欧氏距离更好。

**点积（Dot Product）**
```
A·B = Σ(Ai × Bi)

取值范围：(-∞, ∞)（越大越相似，但受向量长度严重影响）
```

点积只在**所有向量都已经归一化（L2 norm = 1）**时等价于余弦相似度。此时点积 = 余弦值，计算最快。

| 场景 | 推荐度量 |
|---|---|
| 通用语义搜索 | 余弦相似度 |
| 向量已 L2 归一化 | 点积（算得快） |
| 需要考虑"文档重要性" | 欧氏距离 |
| 多模态（图文跨模态） | 余弦相似度 |

### 为什么高维空间有效？

**维度诅咒的逆效应**：在高维空间中，随机向量几乎都互相正交。这意味着不同语义的文本天然分散在空间中，只有真正语义相近的才会靠近。

直观理解：2D 平面可以区分 4 个方向，1024 维空间可以区分 2^1024 个方向——远超宇宙中的原子数。

---

## 3. ANN 索引：为什么不能暴力搜索？

### 暴力搜索的问题

```
100万文档 × 1024维 × 4字节 = 4GB 向量数据
每次查询：100万次浮点乘法 = 约 4B 次运算
耗时：~100ms（勉强可用，但不可扩展）
```

1 亿文档呢？10 亿呢？**必须用近似最近邻（ANN）算法**。

### HNSW（Hierarchical Navigable Small World）

当前最主流的 ANN 算法，被 FAISS、Chroma、Weaviate 等广泛使用。

**核心思想**：像"高速公路 + 城市道路"的分层路网。

```
Layer 2 (顶层): ●───────●           ← 少数"枢纽"节点，跳跃大
                  │
Layer 1:        ●──●──●──●           ← 中等密度，中等跳跃
                  │  │
Layer 0 (底层): ●─●─●─●─●─●─●─●     ← 所有节点，小步移动
```

搜索流程：
1. 从顶层随机入口开始
2. 贪心走到最近点
3. 下降到下一层
4. 重复直到 Layer 0
5. 在 Layer 0 做局部搜索找到最终结果

**复杂度**：O(log N) vs 暴力搜索 O(N)，实际查询 < 10ms。

### 其他 ANN 算法

| 算法 | 思路 | 特点 |
|---|---|---|
| **HNSW** | 分层小世界图 | 查询最快，内存占最多 |
| **IVF** | 聚类 + 倒排 | 内存省，查询稍慢 |
| **IVF-PQ** | IVF + 乘积量化 | 极致内存压缩，精度有损 |
| **LSH** | 哈希到同一桶 | 理论优雅，实际不如 HNSW |
| **DiskANN** | SSD 友好 | 十亿级规模 |

**选型建议**：
- < 100 万条：HNSW（默认首选）
- 100 万-1000 万：IVF-PQ（内存优先）
- > 1000 万：DiskANN 或托管服务（Pinecone/Milvus）

### ANN 的"近似"代价

ANN 不是精确搜索——有概率漏掉真正的最近邻。

```
Recall@10 = ANN返回的top-10有多少在精确搜索的top-10中
```

HNSW 在合理参数下 recall@10 > 99.5%。实际场景中，embedding 模型本身的噪声远大于 ANN 的精度损失。

---

## 4. 实践：一个向量检索的最简实现

```typescript
// 概念代码——非生产级，但展示核心流程

interface VectorDB {
  add(id: string, vector: number[], metadata: Record<string, any>): void;
  search(queryVector: number[], topK: number): SearchResult[];
  buildIndex(): void; // HNSW 或 IVF 索引构建
}

interface SearchResult {
  id: string;
  score: number;    // 相似度分数
  metadata: Record<string, any>;
}

// 1. 添加文档
const db = createVectorDB({ dimensions: 1024, metric: "cosine" });

for (const doc of documents) {
  const embedding = await embeddingModel.encode(doc.content);
  db.add(doc.id, embedding, { title: doc.title, chunk: doc.content });
}

// 2. 构建索引（HNSW）
db.buildIndex();

// 3. 检索
const queryVec = await embeddingModel.encode("TypeScript 泛型怎么用");
const results = db.search(queryVec, 5);

// results = [
//   { id: "doc-42", score: 0.94, metadata: { title: "TS 泛型指南" } },
//   { id: "doc-17", score: 0.87, metadata: { title: "TypeScript 高级类型" } },
//   ...
// ]
```

---

## 5. 关键实践要点

### 向量归一化（Normalization）

```
必须做 L2 归一化。
原因：未归一化的向量，余弦相似度 ≠ 点积，很多向量库内部用点积加速。
方法：v_normalized = v / ||v||₂
```

### 维度选择

| 维度 | 信息容量 | 存储 | 检索速度 | 适用场景 |
|---|---|---|---|---|
| 384 | 低 | 小 | 快 | 边缘设备、简单相似度 |
| 768 | 中 | 中 | 中 | 通用 RAG |
| 1024 | 中高 | 中 | 中 | BGE/Jina 默认，推荐 |
| 1536 | 高 | 大 | 慢 | OpenAI 默认 |
| 3072 | 最高 | 很大 | 最慢 | 需要极高精度 |

**可以通过 PCA 或模型自带的维度截断（如 text-embedding-3 的 dimensions 参数）降低维度，以极小的精度代价换取显著的存储和速度提升。**

### Chunk 粒度影响 Embedding 质量

这是一个常被忽视的关键点：

```
太细 (100 tokens): "猫是一种" — 缺乏上下文，embedding 质量差
刚好 (500-1000 tokens): 一个完整段落，语义完整
太粗 (4000 tokens): 多个主题混合，检索精度下降
```

**规则**：Chunk 大小 = embedding 模型的训练上下文中位数。大多数模型在 256-512 tokens 时效果最佳。

---

## 6. 自己问自己的 3 个问题

1. **为什么 Embedding 模型比 LLM 小几百倍但效果不差？**
   答：因为"理解语义"比"生成文本"简单得多。Encoder 只需要把输入压缩成向量，不需要学会输出分布。类比：阅读一本书和写一本书的难度差别。

2. **余弦相似度 0.8 就一定是相关文档吗？**
   答：不一定。相似度是**相对**的，不是**绝对**的。在问答类文档中 0.8 可能很低，在新闻类文档中 0.8 可能很高。关键是**与同库中其他文档的比较**。

3. **ANN 检索会不会漏掉关键文档？**
   答：会，但在合理参数下概率极低（< 0.5%）。实际瓶颈是 embedding 模型质量，不是 ANN 精度。先优化 embedding，再调 ANN 参数。

---

## 参考资料

- MTEB Leaderboard: https://huggingface.co/spaces/mteb/leaderboard (Embedding 模型权威榜单)
- C-MTEB: 中文 Embedding 基准
- FAISS Wiki: https://github.com/facebookresearch/faiss/wiki
- HNSW 论文: Malkov & Yashunin (2018), "Efficient and robust approximate nearest neighbor search"
