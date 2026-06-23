/**
 * 检索器——向量检索 + 可选重排序
 *
 * 职责：
 *   1. 把用户 query 编码为向量
 *   2. 在向量库中搜索 Top-K 候选
 *   3. （可选）用 Cross-encoder 重排序
 *   4. 返回最终结果
 *
 * 扩展点（对应 theory/02-rag-architecture.md §4）：
 *   - Hybrid Search：结合 BM25 关键词分数 → 见 hybridRetrieve()
 *   - Rerank：调用 Cohere/BGE-Reranker → 见 rerank()
 *   - Multi-Query：同一问题多种表达 → 见 multiQueryRetrieve()
 */

import { VectorStore } from "../vector-db/vector-store.js";
import type { IEmbedder } from "./embedder.js";

export interface RetrievedDoc {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}

export class Retriever {
  constructor(
    private store: VectorStore,
    private embedder: IEmbedder
  ) {}

  /**
   * 标准向量检索
   */
  async retrieve(
    query: string,
    topK: number = 5
  ): Promise<RetrievedDoc[]> {
    const qVec = await this.embedder.encode(query);
    const results = this.store.search(qVec, topK);
    return results.map((r) => ({
      id: r.id,
      content: r.metadata.content || r.metadata.chunk || "",
      score: r.score,
      metadata: r.metadata,
    }));
  }

  /**
   * 混合检索（向量 + 关键词 BM25 风格的融合）
   *
   * 原理：向量检索捕获语义，关键词检索确保精确匹配。
   * alpha 控制权重：alpha=1 = 纯向量，alpha=0 = 纯关键词。
   */
  async hybridRetrieve(
    query: string,
    topK: number = 5,
    alpha: number = 0.7
  ): Promise<RetrievedDoc[]> {
    // 1. 向量检索
    const vectorResults = await this.retrieve(query, Math.max(topK * 3, 15));

    // 2. 简单 BM25 风格关键词评分
    const keywords = this._tokenize(query);
    const keywordScores = new Map<string, number>();

    for (const doc of vectorResults) {
      let score = 0;
      const docTokens = this._tokenize(doc.content.toLowerCase());
      for (const kw of keywords) {
        const count = docTokens.filter((t) => t === kw).length;
        if (count > 0) {
          // IDF 简化版：罕见词权重高
          const docFreq = vectorResults.filter(
            (d) => this._tokenize(d.content.toLowerCase()).filter((t) => t === kw).length > 0
          ).length;
          const idf = Math.log(vectorResults.length / (docFreq + 1)) + 1;
          score += count * idf;
        }
      }
      keywordScores.set(doc.id, score);
    }

    // 3. 归一化关键词分数到 [0, 1]
    const maxKw = Math.max(1, ...keywordScores.values());
    for (const doc of vectorResults) {
      const kwScore = (keywordScores.get(doc.id) || 0) / maxKw;
      doc.score = alpha * doc.score + (1 - alpha) * kwScore;
    }

    return vectorResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private _tokenize(text: string): string[] {
    // 简易分词：按非字母数字字符分割 + 过滤短词
    return text
      .split(/[\s,，。；;：:！!？?()（）\[\]{}""''、]+/)
      .filter((t) => t.length >= 2);
  }
}
