/**
 * 向量存储核心实现
 *
 * 设计理念：教学优先。用清晰的暴力搜索展示核心概念，
 * 同时标注 HNSW/IVF 的扩展点。生产环境请用 FAISS/Chroma/Milvus。
 *
 * 核心概念（对应 theory/01-embedding-vector-search.md）：
 *   1. 余弦相似度 = A·B / (||A|| × ||B||)
 *   2. L2 归一化后，余弦相似度 = 点积（运算快 2-3 倍）
 *   3. 暴力搜索 O(N×D)，ANN 可做到 O(log N)
 */

import type {
  VectorEntry,
  SearchResult,
  MetricType,
  VectorStoreConfig,
  IVectorStore,
} from "./types.js";

export class VectorStore implements IVectorStore {
  private entries: Map<string, VectorEntry> = new Map();
  private _dimensions: number;
  private _metric: MetricType;
  private _normalize: boolean;

  constructor(config: VectorStoreConfig) {
    this._dimensions = config.dimensions;
    this._metric = config.metric || "cosine";
    this._normalize = config.normalize !== false; // 默认 true
  }

  get dimensions(): number {
    return this._dimensions;
  }

  get metric(): MetricType {
    return this._metric;
  }

  get size(): number {
    return this.entries.size;
  }

  // ===== CRUD =====

  add(id: string, vector: number[], metadata: Record<string, any> = {}): void {
    this.validateVector(vector);
    const normalized = this._normalize ? this.l2Normalize(vector) : vector;
    this.entries.set(id, { id, vector: normalized, metadata });
  }

  addBatch(entries: VectorEntry[]): void {
    for (const e of entries) {
      this.add(e.id, e.vector, e.metadata);
    }
  }

  get(id: string): VectorEntry | undefined {
    return this.entries.get(id);
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  // ===== Search =====

  /**
   * 暴力搜索 Top-K（所有 ANN 索引的 fallback 和正确性基准）
   *
   * 复杂度：O(N × D)，N = 条目数，D = 维度
   * 1 万条 × 1024 维 ≈ 1000 万次浮点乘法 ≈ ~5ms (M1)
   * 100 万条 × 1024 维 ≈ 10 亿次 ≈ ~500ms ← 需要 ANN
   *
   * 扩展点：这里可以替换为 HNSW 索引的 searchLayer()
   */
  search(queryVector: number[], topK: number): SearchResult[] {
    this.validateVector(queryVector);
    const query = this._normalize
      ? this.l2Normalize(queryVector)
      : queryVector;

    const scored: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      const score = this.computeSimilarity(query, entry.vector);
      scored.push({
        id: entry.id,
        score,
        metadata: { ...entry.metadata },
      });
    }

    // 降序排列（分数越高越相关），取 Top-K
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // ===== Similarity =====

  /**
   * 计算两个向量的相似度
   *
   * 余弦相似度：cos(θ) = dot(A,B) / (norm(A) × norm(B))
   *   范围 [-1, 1]，1 = 完全相同方向
   *
   * 欧氏距离转换：similarity = 1 / (1 + distance)
   *   把距离映射到 (0, 1]，确保距离越小相似度越高
   *
   * 点积：raw dot product（仅在 L2 归一化后等价于余弦相似度）
   */
  computeSimilarity(a: number[], b: number[]): number {
    switch (this._metric) {
      case "cosine":
        return this.cosineSimilarity(a, b);
      case "euclidean":
        return this.euclideanSimilarity(a, b);
      case "dot":
        return this.dotProduct(a, b);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return dot / denom; // [-1, 1]
  }

  private euclideanSimilarity(a: number[], b: number[]): number {
    let sumSq = 0;
    for (let i = 0; i < a.length; i++) {
      sumSq += (a[i] - b[i]) ** 2;
    }
    const distance = Math.sqrt(sumSq);
    // 转换：距离 0 → 相似度 1；距离 ∞ → 相似度 0
    return 1 / (1 + distance);
  }

  private dotProduct(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  // ===== Utils =====

  /** L2 归一化：v / ||v||₂。归一化后向量模长为 1 */
  l2Normalize(vector: number[]): number[] {
    let sumSq = 0;
    for (const v of vector) sumSq += v * v;
    const norm = Math.sqrt(sumSq);
    if (norm === 0) return vector; // 零向量不归一化
    return vector.map((v) => v / norm);
  }

  private validateVector(vector: number[]): void {
    if (vector.length !== this._dimensions) {
      throw new Error(
        `向量维度不匹配: 期望 ${this._dimensions}，实际 ${vector.length}`
      );
    }
  }

  // ===== Debug =====

  /** 获取所有条目 ID（调试用） */
  listIds(): string[] {
    return [...this.entries.keys()];
  }

  /** 统计信息 */
  stats(): { size: number; dimensions: number; metric: MetricType } {
    return {
      size: this.size,
      dimensions: this._dimensions,
      metric: this._metric,
    };
  }
}
