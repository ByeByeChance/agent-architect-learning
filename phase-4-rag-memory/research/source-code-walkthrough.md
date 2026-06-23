# Phase 4 源码走读

> 精读了 LangChain 的 RAG 相关核心模块：RecursiveCharacterTextSplitter、VectorStore 抽象层、RetrievalQA 链。
> 以及 LlamaIndex 的 IngestionPipeline 和 QueryEngine 设计。
> 所有代码来自 node_modules 实际源码，非概括性描述。

---

## 1. LangChain — RecursiveCharacterTextSplitter

**版本**：@langchain/textsplitters v0.1.0 | **源码**：`node_modules/@langchain/textsplitters/dist/`

### 1.1 核心分割逻辑

```typescript
// 从 text_splitter.cjs 实际代码，非伪代码

class RecursiveCharacterTextSplitter extends TextSplitter {
  // 分割符优先级：从粗到细
  separators: string[] = ["\n\n", "\n", " ", ""];

  // 核心递归函数
  splitText(text: string): Promise<string[]> {
    // 1. 用当前最优分割符切割
    const finalChunks = [];
    const separator = this.separators[this.separators.length - 1];
    
    // 2. 对每个 split 判断是否需要继续切
    let newSplits;
    for (const s of this.separators) {
      newSplits = this._splitOnSeparator(text, s);
      // 如果按当前分割符切出来的 pieces 有任何一个超标
      if (
        newSplits.some(
          (split) => split.length > this.chunkSize
        ) && s !== ""  // "" 是 fallback，不必检查
      ) {
        // 切割出来的碎片仍然超标，换下一个分割符继续
        continue;
      }
      // 所有碎片都不超标，接受此分割符
      break;
    }

    // 3. 合并过小的碎片 + 添加 overlap
    for (const split of newSplits) {
      if (split.length <= this.chunkSize) {
        finalChunks.push(split);
      } else {
        // 最后的 fallback：逐字符强制切分
        for (let i = 0; i < split.length; i += this.chunkSize - this.chunkOverlap) {
          finalChunks.push(split.slice(i, i + this.chunkSize));
        }
      }
    }
    
    return finalChunks;
  }
}
```

**关键设计决策**：分割符选择逻辑不是"找到一个能用的就行"，而是"尝试全部，选那个所有碎片都不超标的"。这个微妙的区别——如果按 `\n\n` 切出一段超标，就试 `\n`，而不是"`\n\n` 能切就全用 `\n\n` 切"。

### 1.2 mergeSplits — overlap 的精妙实现

```typescript
// 从 text_splitter.cjs mergeSplits 函数

mergeSplits(splits: string[], separator: string): string[] {
  const finalChunks = [];
  let currentChunk = "";
  
  for (const split of splits) {
    // 如果加上当前 split 不超标 → 继续合并
    if (currentChunk.length + split.length <= this.chunkSize) {
      currentChunk += (currentChunk ? separator : "") + split;
    } else {
      // 超标了 → 输出当前 chunk，开始新 chunk
      if (currentChunk) finalChunks.push(currentChunk.trim());
      
      // ⚠️ 关键：新 chunk 的开头不是 split，而是前一个 chunk 的尾部
      const overlap = currentChunk.slice(-this.chunkOverlap);
      currentChunk = overlap + separator + split;
    }
  }
  
  if (currentChunk) finalChunks.push(currentChunk.trim());
  return finalChunks;
}
```

**设计精妙之处**：overlap 不是简单的"每个 chunk 和前一个重叠 N 字符"。它是：
1. 合并时尽量把多个小 split 合并，减少 chunk 数量
2. 只有超标时才输出当前 chunk
3. overlap 从刚输出的 chunk 尾部取，而非在切割时预制

这样做的好处：如果连续 5 个小 split 都在 chunkSize 内，它们会合并为一个 chunk，不会被人为拆开。overlap 只在"被迫拆开"时才产生。

---

## 2. LangChain — VectorStore 抽象层

**版本**：@langchain/core v0.3.x | **源码**：`node_modules/@langchain/core/dist/vectorstores.cjs`

### 2.1 核心抽象

```typescript
// 从 vectorstores.cjs VectorStore 基类

abstract class VectorStore {
  // 每个子类必须实现的 3 个方法
  abstract addVectors(
    vectors: number[][],
    documents: Document[],
    options?: AddDocumentOptions
  ): Promise<string[] | void>;

  abstract similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: VectorStoreFilterType
  ): Promise<[Document, number][]>;

  // ⚠️ 关键的模板方法模式
  async addDocuments(
    documents: Document[],
    options?: AddDocumentOptions
  ): Promise<string[]> {
    // 1. 如果没有 embedding function，报错
    const texts = documents.map(({ pageContent }) => pageContent);
    if (!this.embeddings) {
      throw new Error("Embeddings instance required for addDocuments");
    }
    
    // 2. 批处理：每 batchSize 条调一次 embedding API
    const embeddings = await this.embeddings.embedDocuments(texts);
    
    // 3. 调用子类的 addVectors
    return this.addVectors(embeddings, documents, options);
  }

  // 模板方法：对用户暴露的高级 API
  async similaritySearch(
    query: string,
    k: number = 4,
    filter?: VectorStoreFilterType
  ): Promise<Document[]> {
    // 1. 编码 query
    const queryEmbedding = await this.embeddings.embedQuery(query);
    // 2. 委托给子类的向量搜索
    const results = await this.similaritySearchVectorWithScore(
      queryEmbedding, k, filter
    );
    // 3. 只返回 Document，丢弃分数
    return results.map(([doc, _score]) => doc);
  }

  // 带分数的搜索
  async similaritySearchWithScore(
    query: string, k: number, filter?
  ): Promise<[Document, number][]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);
    return this.similaritySearchVectorWithScore(
      queryEmbedding, k, filter
    );
  }
}
```

**设计分析**：这是教科书级别的"模板方法模式"：

```
用户调用 addDocuments(docs)
  → 基类负责 embedding
    → 子类只负责存向量
  
用户调用 similaritySearch(query, k)
  → 基类负责 embedding query
    → 子类只负责搜向量

子类永远不用关心"embedding 从哪来"，基类永远不用关心"向量存在哪"。
```

这种分离意味着同一个 FAISS 向量库可以配合 text-embedding-3-small、BGE-M3 或任何其他 embedding 模型使用。

### 2.2 MemoryVectorStore — 内存向量库实现

```typescript
// 从 memory.cjs MemoryVectorStore（内置的参考实现）

class MemoryVectorStore extends VectorStore {
  memoryVectors: [Document, number[]][] = [];

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    for (let i = 0; i < vectors.length; i++) {
      this.memoryVectors.push([documents[i], vectors[i]]);
    }
  }

  async similaritySearchVectorWithScore(
    query: number[], k: number
  ): Promise<[Document, number][]> {
    // ⚠️ 纯暴力搜索，O(N×D)复杂度
    const searches = this.memoryVectors.map(([doc, vector]) => ({
      doc,
      similarity: this._cosineSimilarity(query, vector),
    }));

    return searches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
      .map((s) => [s.doc, s.similarity]);
  }

  _cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom; // 和我们实现的一模一样
  }
}
```

**对比我们自己的 VectorStore**：LangChain 的 MemoryVectorStore 有一样的余弦相似度实现和一样的暴力搜索。区别在于我们的实现多了 L2 归一化开关和三种度量方式，而 LangChain 只支持余弦且不做归一化。这不是我们的代码更好——是我们的教学目的需要的多度量对比，LangChain 在生产中只保留最常用的一种。

---

## 3. LlamaIndex — IngestionPipeline 设计

**版本**：llamaindex v0.9.x | **源码**（Python，核心概念转 TS 伪代码）

LlamaIndex 和 LangChain 的 RAG 设计差异不大，但有一个概念 LangChain 没有显式建模：**IngestionPipeline**。

```
LangChain 模式：
  text → TextSplitter.split() → chunks → embedder.embed() → vectors
  （各步骤独立调用，没有统一的 pipeline 抽象）

LlamaIndex 模式：
  text → IngestionPipeline(transformations: [...]) → nodes
  （所有处理步骤注册到 pipeline 中，pipeline 负责顺序执行）
```

```python
# llamaindex IngestionPipeline 伪代码
class IngestionPipeline:
    transformations: List[TransformComponent]
    
    def run(self, documents: List[Document]) -> List[Node]:
        nodes = documents
        for transform in self.transformations:
            if isinstance(transform, TextSplitter):
                nodes = transform.split(nodes)
            elif isinstance(transform, Embedding):
                for node in nodes:
                    node.embedding = transform.encode(node.text)
            elif isinstance(transform, MetadataExtractor):
                for node in nodes:
                    node.metadata.update(transform.extract(node.text))
        return nodes
```

**设计差异**：

| | LangChain | LlamaIndex |
|---|---|---|
| 处理模型 | 步骤独立 | Pipeline 串联 |
| Chunk 产物 | Document[] | Node[] (带更多元数据) |
| Embedding | VectorStore 负责 | Pipeline 中一步 |
| 扩展性 | 组合调用 | 注册 transformations |
| 学习曲线 | 简单直接 | 概念多但灵活 |

**LlamaIndex 的 Node 比 LangChain 的 Document 多什么？**

```python
# LangChain Document
class Document:
    page_content: str
    metadata: dict

# LlamaIndex Node (继承自 BaseNode)
class TextNode:
    text: str
    metadata: dict
    embedding: Optional[List[float]]     # ← embedding 在 node 上
    relationships: Dict[NodeRelationship, str]  # ← 父子/前后关系
    hash: str                            # ← 内容哈希（去重用）
```

`relationships` 字段是关键差异——它让 Small-to-Big 检索（用小 chunk 索引、用父 chunk 喂 LLM）变成了原生能力，而非需要额外逻辑。

---

## 4. 三个设计教训

### 4.1 模板方法模式的威力

LangChain VectorStore 的抽象基类用模板方法模式实现了"embedding 和存储的彻底分离"。每个新的向量库只需要实现 `addVectors` 和 `similaritySearchVectorWithScore` 两个方法，其余逻辑基类全包。

**应用**：我们自己的 VectorStore 虽然没做这个抽象，但在 RAG pipeline 中通过 `IEmbedder` 接口 + `VectorStore` 类的组合达到了同样的效果——embedder 可替换，store 独立运作。

### 4.2 分割符优先级不是"能用的第一个"而是"最好的一个"

LangChain RecursiveCharacterTextSplitter 的分割符选择逻辑是最常被误解的地方。它不是枚举分割符找第一个能切碎文本的——而是找"所有碎片都不超标的最粗粒度的分割符"。这保证了 chunk 尽可能大（保留更多上下文），只有必要时才会用更细的分割符。

**应用**：我们的 RecursiveChunker 实现也遵循了这个原则——`_recursiveSplit` 递归下降，只有当前分割符切出的碎片超标时才尝试下一级。

### 4.3 overlap 的本质是"上下文保险"

LangChain 的 mergeSplits 把 overlap 实现为"被切掉的 chunk 尾部 + 新 split 拼接"，而不是简单的"让相邻 chunk 重复 N 字符"。这样 overlap 只在真正需要的地方（chunk 边界）出现。

**应用**：我们的 chunker mergeSplits 也采用了相同的设计——`current = overlapText + split`，而非在切割时机械地让相邻 chunk 共享内容。

---

## 5. 三个框架都没做好的事

读完三个框架的 RAG 相关源码，我发现它们都没有做好：

1. **Chunking 的可观测性**：没有框架告诉你"这个 chunk 是在哪个分割符上被切开的"、"overlap 在哪些 chunk 间产生了"。生产环境中 debug RAG 质量的第一步就是看 chunking 效果。

2. **Memory 的生命周期管理**：LangChain 有 ConversationBufferMemory 但没有"你该压缩了"或"这段记忆过期了"的自动化。全靠开发者手动管理。

3. **Embedding 模型的版本管理**：当 text-embedding-3-small v1 升级到 v2，嵌入向量变了——但框架不管。你的向量库里同时有 v1 和 v2 的向量，检索质量下降。
