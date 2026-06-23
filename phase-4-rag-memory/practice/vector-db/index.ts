/**
 * 向量库 Demo —— 用模拟的 Embedding 数据演示核心概念
 *
 * 注意：这里用随机向量模拟 embedding，真实场景中需要调用
 * Embedding API（OpenAI text-embedding-3 或 BGE-M3）。
 * 这样设计是为了：1) 不依赖外部 API 即可演示向量检索，
 * 2) 清晰展示向量库本身的核心逻辑。
 *
 * 运行：npm run vector-db
 */

import { VectorStore } from "./vector-store.js";
import type { SearchResult } from "./types.js";

// ===== 模拟 Embedding 生成（真实场景替换为 API 调用） =====

/**
 * 为演示目的，生成"语义保持"的模拟向量。
 * 语义相近的文本 → 向量距离近（在真实向量空间的方向上添加小噪声）。
 *
 * 真实场景：
 *   const embedding = await openai.embeddings.create({
 *     model: "text-embedding-3-small",
 *     input: text
 *   });
 *   return embedding.data[0].embedding;
 */
function mockEmbedding(text: string): number[] {
  // 用文本哈希作为种子，确保同文本 = 同向量
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  // 伪随机但确定性的向量生成
  const DIM = 1024;
  const vec: number[] = [];
  for (let i = 0; i < DIM; i++) {
    // 用 hash + 位置做种子，产生 [-1, 1] 的值
    const seed = hash + i * 2654435761;
    const val = Math.sin(seed * 0.001) * 0.5 + Math.cos(seed * 0.0001) * 0.5;
    vec.push(val);
  }
  return vec;
}

// ===== Document Corpus =====

const documents = [
  {
    id: "doc-1",
    title: "React 18 Suspense 详解",
    content:
      "React 18 的 Suspense 组件允许在组件树中声明加载状态。配合 React.lazy() 实现代码分割，Suspense 在服务端支持流式 SSR，可以分块发送 HTML。",
    tags: ["react", "frontend"],
  },
  {
    id: "doc-2",
    title: "TypeScript 泛型高级用法",
    content:
      "TypeScript 泛型允许创建可复用的类型安全组件。条件类型、模板字面量类型、映射类型是高级泛型的三大支柱。infer 关键字用于类型推断。",
    tags: ["typescript", "frontend"],
  },
  {
    id: "doc-3",
    title: "RAG 检索增强生成原理",
    content:
      "RAG 将文档分块 → Embedding → 向量检索 → 增强 Prompt → LLM 生成。核心是把外部知识注入 LLM 的 context window，解决知识截止和幻觉问题。",
    tags: ["AI", "RAG"],
  },
  {
    id: "doc-4",
    title: "Node.js Stream API 最佳实践",
    content:
      "Node.js Stream 提供背压机制处理大数据流。Transform stream 适合数据转换管道，pipeline() 比 pipe() 更安全因为它正确处理错误和清理。",
    tags: ["nodejs", "backend"],
  },
  {
    id: "doc-5",
    title: "React 中的状态管理方案对比",
    content:
      "React 状态管理：useState 用于局部状态，useReducer 用于复杂状态逻辑，Context 用于跨组件共享，Zustand 用于全局状态且 API 简洁，Redux Toolkit 用于大型应用。",
    tags: ["react", "frontend"],
  },
  {
    id: "doc-6",
    title: "HNSW 近似最近邻搜索算法",
    content:
      "HNSW 通过分层图结构实现 O(log N) 的近似最近邻搜索。每层有不同的连接密度，搜索从稀疏的高层开始贪心下降到底层精细化搜索。",
    tags: ["AI", "algorithm"],
  },
  {
    id: "doc-7",
    title: "Docker 容器化部署指南",
    content:
      "Docker 通过容器隔离运行环境。Dockerfile 定义构建步骤，docker-compose 编排多容器服务。多阶段构建减小镜像体积，健康检查确保服务可用。",
    tags: ["devops", "docker"],
  },
  {
    id: "doc-8",
    title: "Python asyncio 异步编程",
    content:
      "Python asyncio 使用事件循环实现协程并发。async/await 语法糖让异步代码读起来像同步。适用于 IO 密集型任务而非 CPU 密集型。",
    tags: ["python", "backend"],
  },
];

// ===== Demo =====

console.log("\n🔬 向量存储 Demo\n");
console.log("=".repeat(65));

// 1. 创建向量库
console.log("\n📦 1. 创建向量库 (1024 维, 余弦相似度, 自动 L2 归一化)");
const store = new VectorStore({ dimensions: 1024, metric: "cosine" });

// 2. 摄入文档
console.log(`\n📥 2. 摄入 ${documents.length} 篇文档...`);
for (const doc of documents) {
  const embedding = mockEmbedding(doc.content);
  store.add(doc.id, embedding, {
    title: doc.title,
    content: doc.content.slice(0, 80) + "...",
    tags: doc.tags,
  });
}
console.log(`   向量库大小: ${store.size}`);

// 3. 搜索演示
console.log("\n🔍 3. 搜索演示\n");

const queries = [
  "React 组件如何管理加载状态？",
  "如何处理大规模数据流？",
  "相似度搜索算法有哪些？",
];

for (const query of queries) {
  console.log(`   Query: "${query}"`);
  const queryVec = mockEmbedding(query);
  const results = store.search(queryVec, 3);

  results.forEach((r, i) => {
    const bar = "█".repeat(Math.round(r.score * 20));
    console.log(
      `     ${i + 1}. [${r.score.toFixed(3)}] ${bar} ${r.metadata.title}`
    );
    console.log(`        ${r.metadata.content}`);
  });
  console.log();
}

// 4. 度量方式对比
console.log("📐 4. 三种相似度度量对比\n");

const a = store.l2Normalize(mockEmbedding("React 状态管理"));
const b = store.l2Normalize(mockEmbedding("React 组件渲染"));
const c = store.l2Normalize(mockEmbedding("Docker 容器部署"));

const metrics = ["cosine", "euclidean", "dot"] as const;
for (const m of metrics) {
  const s = new VectorStore({ dimensions: 1024, metric: m, normalize: true });
  const sim_ab = s.computeSimilarity(a, b);
  const sim_ac = s.computeSimilarity(a, c);

  console.log(
    `   ${m.padEnd(12)} 相关(React↔React): ${sim_ab.toFixed(4)}  |  无关(React↔Docker): ${sim_ac.toFixed(4)}  |  区分度: ${(sim_ab - sim_ac).toFixed(4)}`
  );
}

// 5. 统计
console.log("\n📊 5. 向量库统计");
console.log(`   ${JSON.stringify(store.stats())}`);

console.log("\n" + "=".repeat(65));
console.log(
  "\n💡 教学提示：这里用的是 mock embedding（伪随机向量）。"
);
console.log(
  "   真实场景中，替换 mockEmbedding() 为 OpenAI/BGE API 即可获得真正的语义搜索能力。"
);
console.log(
  "   向量库本身的设计（归一化、相似度计算、搜索接口）是完全一致的。\n"
);
