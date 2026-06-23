/**
 * RAG Pipeline 完整 Demo
 *
 * 端到端演示：文档摄入 → Chunking → Embedding → 检索 → 增强 → 生成
 *
 * 运行：npm run rag
 *
 * 流程对应 theory/02-rag-architecture.md §2 的完整 pipeline。
 * 当前使用 MockEmbedder（无需 API），生成环节调 DeepSeek API。
 */

import { VectorStore } from "../vector-db/vector-store.js";
import { RecursiveChunker } from "./chunker.js";
import { createEmbedder } from "./embedder.js";
import { Retriever } from "./retriever.js";
import { generate, generateMapReduce } from "./generator.js";

// ===== Sample Knowledge Base =====

const KNOWLEDGE_BASE = [
  {
    id: "react-suspense",
    title: "React 18 Suspense 详解",
    content: `React 18 的 Suspense 组件允许在组件树中声明加载状态。

Suspense 最早在 React 16.6 中引入，但只支持 React.lazy() 代码分割场景。React 18 全面扩展了 Suspense 的能力：

1. 服务端流式渲染（Streaming SSR）：使用 renderToPipeableStream()，可以在服务端渲染过程中分块发送 HTML，不需要等待整个页面完成。用户能更快看到首屏内容。

2. 数据获取（Data Fetching）：配合 React Query、SWR 或 Relay 等库，Suspense 可以在数据加载期间显示 fallback UI。这是并发特性（Concurrent Features）的一部分。

3. 代码分割：配合 React.lazy()，组件级别的懒加载，打包工具会自动分离 chunk。

使用方式：
\`\`\`tsx
import { Suspense } from 'react';
const LazyComponent = React.lazy(() => import('./Heavy'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <LazyComponent />
    </Suspense>
  );
}
\`\`\`

重要限制：Suspense 只能包裹同步子组件，不支持在 useEffect 中异步加载的情况。`,
  },
  {
    id: "ts-generics",
    title: "TypeScript 泛型深入",
    content: `TypeScript 的泛型系统是构建可复用、类型安全组件的核心。

基础泛型：
\`\`\`typescript
function identity<T>(arg: T): T { return arg; }
\`\`\`

泛型约束（Generic Constraints）：
\`\`\`typescript
function getLength<T extends { length: number }>(arg: T): number {
  return arg.length;
}
\`\`\`

条件类型（Conditional Types）是 TypeScript 泛型的三支柱之一：
\`\`\`typescript
type IsString<T> = T extends string ? true : false;
type Result = IsString<"hello">; // true
\`\`\`

映射类型（Mapped Types）：
\`\`\`typescript
type Readonly<T> = { readonly [K in keyof T]: T[K] };
\`\`\`

模板字面量类型（Template Literal Types，TS 4.1+）：
\`\`\`typescript
type EventName<T extends string> = \`on\${Capitalize<T>}\`;
type ClickEvent = EventName<"click">; // "onClick"
\`\`\`

infer 关键字用于在条件类型中推断类型：
\`\`\`typescript
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
\`\`\`

泛型在 React 中的常见应用包括：泛型组件 Props、泛型 Hook、以及泛型上下文。`,
  },
  {
    id: "rag-principle",
    title: "RAG 检索增强生成原理",
    content: `RAG（Retrieval-Augmented Generation）是一种将外部知识注入 LLM 的技术架构。

核心流程：
1. 文档摄入（Ingestion）：文档 → 文本提取 → Chunking → Embedding → 向量库
2. 检索（Retrieval）：用户问题 → 向量化 → 向量相似度搜索 → Top-K 文档
3. 增强（Augmentation）：把检索到的文档和用户问题拼成 prompt
4. 生成（Generation）：LLM 基于增强后的 prompt 生成答案

为什么需要 RAG？
- LLM 的知识有截止日期，无法回答训练后发生的事
- 幻觉问题：LLM 可能生成看似合理但错误的内容
- 可追溯性：RAG 的答案可以引用来源文档

Chunking 是 RAG 的基础设施中的关键环节：
- 太粗（>2000 tokens）：检索不准，多个主题混合
- 太细（<100 tokens）：缺乏上下文，embedding 质量差
- 推荐范围：256-512 tokens，具体取决于 embedding 模型

检索技术演进：
- 基础：Bi-encoder 向量检索（query 和 doc 各自独立编码）
- 提升：Hybrid Search（向量 + BM25 关键词）
- 进阶：Cross-encoder Reranker（同时编码 query+doc 对）
- 高级：Multi-Query + HyDE 查询增强

RAG 和 Fine-tuning 是互补关系，不是替代关系。RAG 解决"查新资料"，Fine-tuning 解决"学新技能"。`,
  },
  {
    id: "hnsw-algorithm",
    title: "HNSW 算法原理",
    content: `HNSW（Hierarchical Navigable Small World）是近似最近邻搜索的主流算法。

核心思想：分层跳表 + 小世界图。

算法结构：
- 底层（Layer 0）：包含所有节点，连接密集，搜索精细
- 中层（Layer 1, 2, ...）：节点逐渐稀疏，连接跳跃距离大
- 高层：只有少数"枢纽"节点，负责快速缩小搜索范围

搜索过程：
1. 从顶层随机入口节点开始
2. 在当前层执行贪心搜索，找到最近节点
3. 下降到该节点的下一层
4. 重复直到 Layer 0，做最终局部搜索

参数：
- M：每个节点的最大连接数（默认 16），影响内存和精度
- efConstruction：构建时的搜索宽度（默认 200），影响索引质量和构建时间
- efSearch：查询时的搜索宽度，影响查询速度和召回率

复杂度：搜索 O(log N)，构建 O(N log N)

为什么比暴力搜索好？
- 100 万条 1024 维向量暴力搜索：~500ms
- HNSW 同等条件：~2-5ms
- 召回率 @10 > 99%（合理参数下）

FAISS 的 HNSW 实现是目前生产环境最广泛的。hnswlib（C++库）提供 Python 绑定。

其他 ANN 算法对比：
- IVF（倒排文件）：内存更省，适合千万级
- IVF-PQ（乘积量化）：极致压缩，精度有损
- LSH（局部敏感哈希）：理论优雅，实际不如 HNSW`,
  },
  {
    id: "nodejs-stream",
    title: "Node.js Stream 和背压机制",
    content: `Node.js Stream 是处理大数据流的核心 API，提供背压（Backpressure）机制防止内存溢出。

四种 Stream 类型：
1. Readable：数据来源（文件读取、HTTP 请求）
2. Writable：数据目标（文件写入、HTTP 响应）
3. Transform：数据转换（压缩、加密、解析）
4. Duplex：同时可读可写（Socket）

背压机制原理：
当 Writable 的写入速度快于底层系统处理速度时，Stream 会暂停 Readable 的数据读取，直到缓冲区排空。这防止了数据在内存中无限堆积。

\`\`\`typescript
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';

await pipeline(
  createReadStream('input.txt'),
  createGzip(),
  createWriteStream('output.txt.gz')
);
\`\`\`

pipeline() vs pipe()：
- pipe() 不会自动销毁 stream，错误时可能导致内存泄漏
- pipeline() 正确处理错误传播和 stream 清理
- Node.js 官方推荐使用 pipeline()

Transform Stream 实战场景：
- 数据 ETL 管道（Extract → Transform → Load）
- CSV → JSON 转换流
- 请求/响应日志中间件`,
  },
];

// ===== RAG Pipeline =====

async function main() {
  console.log("\n🔬 RAG Pipeline Demo\n");
  console.log("=".repeat(65));

  // ===== Phase 1: Ingestion =====
  console.log("\n📥 Phase 1: 文档摄入\n");

  const chunker = new RecursiveChunker({ chunkSize: 800, overlap: 100 });
  const embedder = createEmbedder("mock", { dimensions: 1024 });
  const store = new VectorStore({ dimensions: 1024, metric: "cosine" });

  for (const doc of KNOWLEDGE_BASE) {
    const chunks = chunker.split(doc.content);
    console.log(`  ${doc.title}: ${chunks.length} chunks`);

    for (const chunk of chunks) {
      const embedding = await embedder.encode(chunk.content);
      store.add(`${doc.id}#${chunk.metadata.index}`, embedding, {
        docId: doc.id,
        title: doc.title,
        content: chunk.content,
        chunkIndex: chunk.metadata.index,
      });
    }
  }

  console.log(`\n  ✅ 总计 ${store.size} 个向量入库`);

  // ===== Phase 2: Query =====
  console.log("\n🔍 Phase 2: 检索 + 生成\n");

  const retriever = new Retriever(store, embedder);

  const queries = [
    {
      q: "React Suspense 怎么用？有什么限制？",
      useHybrid: false,
    },
    {
      q: "TypeScript 泛型有哪些高级用法？",
      useHybrid: true,
    },
  ];

  for (let i = 0; i < queries.length; i++) {
    const { q, useHybrid } = queries[i];
    console.log(`  ┌─ 查询 ${i + 1}: "${q}"`);
    console.log(`  │  ${useHybrid ? "混合检索 (向量+关键词)" : "纯向量检索"}`);

    // 检索
    const docs = useHybrid
      ? await retriever.hybridRetrieve(q, 3)
      : await retriever.retrieve(q, 3);

    console.log(`  ├─ 检索结果:`);
    docs.forEach((d, j) => {
      const bar = "█".repeat(Math.round(d.score * 15));
      console.log(
        `  │    ${j + 1}. [${d.score.toFixed(3)}] ${bar} ${d.metadata.title}`
      );
    });

    // 生成（调用 DeepSeek API）
    console.log(`  ├─ 调用 LLM 生成...`);
    const result = await generate(q, docs);

    console.log(`  ├─ 答案 (${result.latencyMs}ms):`);
    // 缩进显示答案
    result.answer.split("\n").forEach((line) => {
      console.log(`  │  ${line}`);
    });

    if (i < queries.length - 1) {
      console.log(`  └─\n`);
      await sleep(500);
    } else {
      console.log(`  └─`);
    }
  }

  // ===== Phase 3: Map-Reduce 模式演示 =====
  console.log(
    "\n🗺️  Phase 3: Map-Reduce 增强模式演示\n"
  );

  const complexQ = "Node.js Stream 和 HNSW 算法各有什么核心思想？";
  console.log(`  Query: "${complexQ}"`);

  const docs = await retriever.retrieve(complexQ, 4);
  console.log(`  检索到 ${docs.length} 篇文档`);
  console.log(`  使用 Map-Reduce：每篇独立生成 → 汇总\n`);

  const mrResult = await generateMapReduce(complexQ, docs);
  console.log(`  答案 (${mrResult.latencyMs}ms):`);
  mrResult.answer.split("\n").forEach((line) => {
    console.log(`    ${line}`);
  });

  // ===== Summary =====
  console.log("\n" + "=".repeat(65));
  console.log("\n📊 Pipeline 架构总结\n");
  console.log("  Ingest:  Document → Chunker → Embedder → VectorStore");
  console.log("  Query:   Question → Embedder → Retriever → Generator → Answer");
  console.log("                    ↑                        ↑");
  console.log("               MockEmbedder              DeepSeek API");
  console.log("              (无需 API)              (真实 LLM 调用)");
  console.log(
    "\n💡 将 MockEmbedder 替换为 OpenAIEmbedder 即可获得真正的语义检索能力。\n"
  );
}

main().catch((err) => {
  console.error("❌ RAG pipeline error:", err);
  process.exit(1);
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
