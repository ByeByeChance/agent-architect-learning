/**
 * Embedding 服务层
 *
 * 职责：把文本变成向量。支持两种实现：
 *   1. MockEmbedder — 确定性伪随机向量，用于演示/测试，无需 API
 *   2. OpenAIEmbedder — 调用 text-embedding-3-small API（需有效 key）
 *
 * 接口统一，可互换。这就是"策略模式"在 RAG 中的应用。
 */

export interface EmbedderConfig {
  dimensions: number;
  model?: string;
}

export interface IEmbedder {
  readonly dimensions: number;
  encode(text: string): Promise<number[]>;
  encodeBatch(texts: string[]): Promise<number[][]>;
}

// ===== Mock Embedder (确定性 = 同文本永远同向量) =====

export class MockEmbedder implements IEmbedder {
  readonly dimensions: number;
  readonly model: string;

  constructor(config: EmbedderConfig) {
    this.dimensions = config.dimensions;
    this.model = "mock/v1";
  }

  async encode(text: string): Promise<number[]> {
    return this._deterministicVector(text);
  }

  async encodeBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this._deterministicVector(t));
  }

  /**
   * 确定性向量生成：用文本内容做种子，相同文本 = 相同向量。
   * 关键是让语义相近的文本真的相近——这里用了简单的 n-gram 模拟，
   * 让包含相同子串的文本在向量空间中更接近。
   */
  private _deterministicVector(text: string): number[] {
    const vec = new Array(this.dimensions).fill(0);

    // 字符级 3-gram 叠加——共享 n-gram 越多的文本向量越接近
    const normalized = text.toLowerCase();
    for (let i = 0; i < normalized.length - 2; i++) {
      const trigram = normalized.slice(i, i + 3);
      let hash = 0;
      for (let j = 0; j < trigram.length; j++) {
        hash = ((hash << 5) - hash + trigram.charCodeAt(j)) | 0;
      }
      // 每个 trigram 对向量的一小部分维度产生贡献
      for (let d = 0; d < Math.min(8, this.dimensions); d++) {
        const idx = ((hash + d * 2654435761) % this.dimensions + this.dimensions) % this.dimensions;
        vec[idx] += Math.sin(hash * 0.001 + d) * 0.01;
      }
    }

    // L2 归一化
    let sumSq = 0;
    for (const v of vec) sumSq += v * v;
    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }

    return vec;
  }
}

// ===== OpenAI Embedder（真实 API——需要有效 OPENAI_API_KEY） =====

export class OpenAIEmbedder implements IEmbedder {
  readonly dimensions: number;
  readonly model: string;
  private client: any;

  constructor(config: EmbedderConfig) {
    this.dimensions = config.dimensions;
    this.model = config.model || "text-embedding-3-small";
  }

  private _getClient(): any {
    if (!this.client) {
      // 延迟加载，避免没有 openai 包时启动报错
      const { default: OpenAI } = require("openai");
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }

  async encode(text: string): Promise<number[]> {
    const c = this._getClient();
    const res = await c.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions, // text-embedding-3 支持维度截断
    });
    return res.data[0].embedding;
  }

  async encodeBatch(texts: string[]): Promise<number[][]> {
    const c = this._getClient();
    const res = await c.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });
    return res.data.map((d: any) => d.embedding);
  }
}

// ===== Factory =====

export function createEmbedder(
  type: "mock" | "openai",
  config?: EmbedderConfig
): IEmbedder {
  const dimensions = config?.dimensions || 1024;
  switch (type) {
    case "mock":
      return new MockEmbedder({ dimensions });
    case "openai":
      return new OpenAIEmbedder({ dimensions, model: config?.model });
  }
}
