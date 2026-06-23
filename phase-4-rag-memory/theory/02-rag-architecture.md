# RAG 架构设计

> 核心问题：Embedding 检索到文档后，怎么把"文档片段"变成 LLM 可用的"增强上下文"？答案是 **RAG Pipeline**——**检索（Retrieve）→ 增强（Augment）→ 生成（Generate）**。

---

## 1. RAG 是什么：一个具体例子

```
用户问：React 18 的 useId hook 怎么用？

传统 LLM：                                  RAG：
┌─────────────────────┐                     ┌─────────────────────┐
│ 用户问题              │                     │ 1. Embedding(用户问题) │
│         ↓            │                     │         ↓             │
│ LLM                  │                     │ 2. 向量检索 Top-5    │
│ (全靠训练集记忆)      │                     │         ↓             │
│         ↓            │                     │ 3. 把检索结果 + 问题  │
│ "useId是生成唯一ID    │                     │    拼成增强 prompt     │
│  的hook..."          │                     │         ↓             │
│ ⚠️ 可能过时/幻觉      │                     │ 4. LLM 基于文档生成    │
└─────────────────────┘                     │         ↓             │
                                            │ "根据React 18文档,     │
                                            │  useId用于..."        │
                                            │ ✅ 有来源、可追溯      │
                                            └─────────────────────┘
```

**RAG 解决的核心问题**：LLM 的知识截止日期和幻觉。给它文档，让它基于文档回答，而不是凭记忆猜。

---

## 2. RAG Pipeline 完整架构

```
              Ingest (离线)                      Query (在线)
         ┌──────────────────┐              ┌──────────────────┐
         │                   │              │                   │
         │  文档源            │              │  用户问题          │
         │  (MD/PDF/HTML)    │              │                   │
         │      ↓            │              │      ↓            │
         │  文本提取          │              │  Query 改写       │
         │      ↓            │              │  (可选: HyDE/     │
         │  Chunking         │              │   Multi-Query)    │
         │      ↓            │              │      ↓            │
         │  Embedding        │              │  Embedding        │
         │      ↓            │              │      ↓            │
         │  向量库存储 ──────────→ 检索 ←────── 向量检索         │
         │                   │    │         │      ↓            │
         │                   │    │         │  重排序 (Rerank)   │
         │                   │    │         │      ↓            │
         │                   │    │         │  增强 Prompt       │
         │                   │    │         │      ↓            │
         │                   │    │         │  LLM 生成         │
         │                   │    │         │      ↓            │
         │                   │    │         │  后处理+引用       │
         │                   │    │         │      ↓            │
         │                   │    │         │  返回用户          │
         └──────────────────┘    │         └──────────────────┘
                                 │
              离线：每周/每日触发   在线：每次查询实时
```

**关键认知**：Ingest 是离线批处理，Query 是在线实时。两者的瓶颈不同——Ingest 瓶颈在 chunking 质量，Query 瓶颈在检索延迟。

---

## 3. Chunking：RAG 的根基工程

Chunking 策略决定了检索质量的上限。**Chunk 太大 = 检索不准，太小 = 缺乏上下文。**

### 五种 Chunking 策略

#### (1) 固定长度（Fixed-size）

```
const CHUNK_SIZE = 512; // tokens
const OVERLAP = 64;     // tokens

// "chunk1: ...最后64个token和chunk2开头64个token重复"
```

优点：实现简单，处理快。缺点：可能在句子中间切断。

#### (2) 递归字符分割（Recursive Character Split）

LangChain 默认策略：

```typescript
const SEPARATORS = ["\n\n", "\n", "。", ".", " ", ""];

function recursiveSplit(text: string, chunkSize: number): string[] {
  for (const sep of SEPARATORS) {
    if (text.includes(sep) || sep === "") {
      return splitBySeparator(text, sep, chunkSize);
    }
  }
}
```

从粗到细尝试分割符——先按段落，不行按句子，再不行按词，最后按字符。

优点：语义完整性好。缺点：对没有自然分隔符的文本（如代码）效果差。

#### (3) 语义分割（Semantic）

使用 embedding 模型检测"语义转折点"：

```
段落A 段落B 段落C 段落D
  │      │      │      │
  [vecA] [vecB] [vecC] [vecD]
  
  计算相邻段落的余弦相似度：
  A↔B: 0.87   B↔C: 0.91   C↔D: 0.42 ← 断裂点！这里切
```

优点：语义最完整。缺点：需要额外 embedding 计算，成本高。

#### (4) 文档结构感知（Structure-aware）

按文档自身结构切分——Markdown 标题、代码文件的函数/类边界：

```markdown
## 第1节         → Chunk 1
内容是...
## 第2节         → Chunk 2
内容是...
### 第2.1小节   → Chunk 3 (子节可独立或合并)
```

优点：保留文档作者的结构意图。缺点：需要文档格式规范化。

#### (5) 小2大（Small-to-Big）

检索时用小 chunk（精确），喂 LLM 时用大 chunk（上下文完整）：

```
索引: 100-token 句子级 chunks → 检索到 chunk 42
扩充: 找到 chunk 42 所属的 2000-token 父文档 → 喂给 LLM
```

这是目前**最推荐的策略**——兼顾检索精度和上下文完整性。

### Chunking 策略对比

| 策略 | 语义完整 | 检索精度 | 实现难度 | 适用场景 |
|---|---|---|---|---|
| 固定长度 | ⭐⭐ | ⭐⭐⭐ | ⭐ | 快速原型、英文文本 |
| 递归字符 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 通用场景（推荐首选） |
| 语义分割 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | 高质量知识库 |
| 结构感知 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 文档/代码库 |
| Small-to-Big | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 生产环境（推荐） |

---

## 4. 检索：不只是向量搜索

### 稀疏 + 稠密混合检索（Hybrid Search）

纯向量检索的困境：

```
用户问："React 中 useCallback 和 useMemo 有什么区别？"
纯向量检索可能返回："Vue 中 computed 和 watch 的区别"  ← 语义相似但无关！
```

**关键词匹配（BM25）可以修正这个问题**：

```typescript
// 混合检索：向量 + 关键词
const hybridScore = alpha * vectorScore + (1 - alpha) * bm25Score;
// alpha = 0.7~0.8 通常效果最好
```

BM25 确保包含"useCallback"和"useMemo"关键词的文档不会被漏掉。向量检索确保语义相关。"两者同时命中的文档"排名最高。

### 重排序（Re-ranking）

向量检索返回 Top-50 候选 → 用更精确（但更慢）的模型重排 → 取 Top-5 喂 LLM。

```
检索 (HNSW, < 10ms)      重排序 (Cross-encoder, ~200ms)    生成
100万 docs → 50 candidates → 重排模型打分 → 5 best → LLM
                                                          ↑
                                    比如 BGE-Reranker、Cohere Rerank
                                    Cross-encoder 同时看 query 和 doc
                                    Bi-encoder 只看各自 embedding
```

**为什么重排有效？**向量检索用的是 bi-encoder（query 和 doc 各自独立编码），重排用的是 cross-encoder（同时输入 query 和 doc 对）。Cross-encoder 能看到两者的交互关系，精度高得多——但太慢，不能用于全库扫描。

### 查询增强技术

| 技术 | 做法 | 适用场景 |
|---|---|---|
| **HyDE** | 先让 LLM 生成"假设答案"，用假设答案做向量检索 | 抽象问题、概念性问题 |
| **Multi-Query** | 同一问题改写为 3-5 个不同表达，各自检索后合并去重 | 短问题、歧义问题 |
| **Query Decomposition** | 复杂问题拆成子问题，各自检索，汇总 | 多步推理问题 |
| **Self-Query** | LLM 从问题中提取元数据过滤条件（如 "date > 2024"） | 结构化数据+非结构化文本 |

**HyDE 原理**：

```
用户问："如何优化 React 渲染性能？"

1. LLM 生成假设答案（不需要真实）：
   "使用 React.memo、useMemo、useCallback 来减少不必要的重渲染，
    使用虚拟列表处理长列表，使用 React.lazy 做代码分割..."

2. 用假设答案（而非原始问题）做向量检索

3. 为什么有效？假设答案的语言模式更接近文档中的语言模式
   （原始问题是"问句"，文档是"陈述句"，语言风格不匹配）
```

---

## 5. 增强：把检索结果变成 Prompt

### 三种增强模式

**(1) Stuff — 全塞进去**

```
System: 你是文档助手。
Context: [chunk 1] [chunk 2] ... [chunk N]
Question: {用户问题}
```

最简单，所有检索结果全塞进 prompt。缺点：超出 context window 时要么截断要么报错。

**(2) Map-Reduce — 分片总结**

```
Map:   对每个 chunk 独立回答 → 部分答案1, 部分答案2, ...
Reduce: 汇总所有部分答案 → 最终答案
```

适合"总结全部文档"类型的任务。缺点是每篇 chunk 都调一次 LLM，贵且慢。

**(3) Refine — 迭代精炼**

```
读取 chunk 1 → 形成初始答案
读取 chunk 2 → 在初始答案基础上补充修正 → 新答案
读取 chunk 3 → 继续补充修正 → 最终答案
```

适合"答案需要综合多个信息源"的任务。比 Map-Reduce 更省 token（每次只处理一个 chunk），但串行调用延迟高。

### 选择建议

| 场景 | 推荐模式 |
|---|---|
| 简单问答，< 5个 chunk | Stuff |
| 总结长文档 | Map-Reduce |
| 需要综合多个信息源 | Refine |
| 90% 的 RAG 场景 | Stuff（chunk 少时最直接） |

---

## 6. RAG 常见失败模式

| 失败模式 | 症状 | 根因 | 解决 |
|---|---|---|---|
| **检索不到** | 回答"我不知道"或不相关 | Chunk 太粗 / embedding 质量差 | 换 embedding 模型 / hybrid search |
| **检索到但不看** | 回答忽略了检索结果 | Prompt 设计问题 | 强化 prompt："你必须基于以下文档回答" |
| **检索到但矛盾** | 多个来源说法不一致 | 文档质量差 | 告诉 LLM 存在矛盾，让它说明分歧 |
| **检索到但过时** | 回答包含旧 API | 向量库未更新 | 建文档更新管道，加时间过滤 |
| **上下文太短** | 回答不完整 | Chunk 太小，缺乏上下文 | 使用 Small-to-Big 策略 |
| **幻觉背书** | 检索结果无关但 LLM 强行"使用" | 检索精度不够 | 提高 top-K 质量 / 加 reranker |

---

## 7. 一个完整的 RAG Pipeline 伪代码

```typescript
interface RAGPipeline {
  // 离线：文档摄入
  ingest(documents: Document[]): Promise<void>;
  
  // 在线：RAG 查询
  query(question: string): Promise<RAGResponse>;
}

interface RAGResponse {
  answer: string;
  sources: { chunkId: string; content: string; score: number }[];
  latency: { retrieval: number; generation: number };
}

async function buildRAGPipeline(config: RAGConfig): Promise<RAGPipeline> {
  const embedder = new EmbeddingModel(config.embeddingModel);
  const vectorDB = new VectorDB({ dimensions: embedder.dimensions });
  const chunker = new RecursiveChunker({ size: 512, overlap: 64 });
  const llm = createLLMClient();
  
  return {
    async ingest(docs: Document[]) {
      for (const doc of docs) {
        const chunks = chunker.split(doc.content);
        const embeddings = await embedder.encodeBatch(chunks);
        await vectorDB.upsert(chunks.map((chunk, i) => ({
          id: `${doc.id}#${i}`,
          vector: embeddings[i],
          metadata: { docId: doc.id, title: doc.title, chunk }
        })));
      }
    },
    
    async query(question: string) {
      // Step 1: Query embedding
      const qVec = await embedder.encode(question);
      
      // Step 2: 向量检索 (Top-10)
      const candidates = await vectorDB.search(qVec, 10);
      
      // Step 3: Rerank (Top-10 → Top-3)
      const reranked = await reranker.rerank(question, candidates, 3);
      
      // Step 4: 构造增强 prompt
      const context = reranked
        .map((r, i) => `[文档${i+1}] ${r.metadata.title}\n${r.metadata.chunk}`)
        .join("\n\n");
      
      const prompt = [
        { role: "system", content: `你是一个基于文档的问答助手。${systemPrompt}` },
        { role: "user", content: `参考文档：\n${context}\n\n问题：${question}` }
      ];
      
      // Step 5: LLM 生成
      const result = await llm.chat(prompt);
      
      return {
        answer: result.content,
        sources: reranked.map(r => ({
          chunkId: r.id,
          content: r.metadata.chunk.slice(0, 200),
          score: r.score
        })),
        latency: { retrieval: 0, generation: result.latencyMs }
      };
    }
  };
}
```

---

## 8. 自己问自己的 3 个问题

1. **为什么不能把整个文档喂给 LLM，非要 chunking？**
   答：两个原因：(1) Context window 有限，虽然现在 200K 了，但你若有 1 万份文档呢？(2) 检索精度——长文档包含多个主题，embedding 会被稀释。一个 2000 词的文档，里面混了"性能优化"和"CSS 动画"，检索"React 性能优化"时可能命中——但因为文档后半段在讲 CSS，整体 embedding 不够精准。

2. **RAG 和 Fine-tuning 是什么关系？**
   答：RAG 是给 LLM 查资料，Fine-tuning 是教 LLM 新知识。RAG 适合频繁更新的知识（文档、API、新闻），Fine-tuning 适合稳定的技能（风格、格式、领域术语）。生产环境常两者结合：Fine-tune 一个擅长用检索结果的模型 + RAG 提供最新知识。

3. **检索质量怎么评估？**
   答：两个核心指标——Recall@K（K 个结果中包含了多少个正确的？）和 MRR（第一个正确结果平均排第几？）。直觉：如果检索结果和人手工挑选的结果完全一致，K=5 时 Recall 应该接近 100%。

---

## 参考资料

- Lewis et al. (2020), "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" — RAG 原始论文
- Gao et al. (2023), "Retrieval-Augmented Generation for Large Language Models: A Survey" — RAG 综述
- LangChain RAG 文档: https://python.langchain.com/docs/tutorials/rag/
- LlamaIndex 文档: https://docs.llamaindex.ai/
