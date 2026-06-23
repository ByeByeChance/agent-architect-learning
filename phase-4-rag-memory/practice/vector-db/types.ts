/**
 * 向量库核心类型定义
 */

/** 带 metadata 的向量条目 */
export interface VectorEntry {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
}

/** 搜索结果 */
export interface SearchResult {
  id: string;
  score: number; // 相似度分数，0-1（越高越相关）
  metadata: Record<string, any>;
}

/** 相似度度量类型 */
export type MetricType = "cosine" | "euclidean" | "dot";

/** 向量库配置 */
export interface VectorStoreConfig {
  dimensions: number;
  metric?: MetricType;
  /** 是否在入库时自动 L2 归一化 */
  normalize?: boolean;
}

/** 向量库接口 */
export interface IVectorStore {
  add(id: string, vector: number[], metadata?: Record<string, any>): void;
  addBatch(entries: VectorEntry[]): void;
  search(queryVector: number[], topK: number): SearchResult[];
  delete(id: string): boolean;
  get(id: string): VectorEntry | undefined;
  size: number;
  clear(): void;
}
