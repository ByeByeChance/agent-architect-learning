/**
 * 递归字符分割器（Recursive Character Splitter）
 *
 * 设计理念（对应 theory/02-rag-architecture.md §3）：
 *   从粗到细尝试分割符——先按段落，不行按句子，再不行按词，最后按字符。
 *   这是 LangChain 的默认 chunking 策略，也是生产环境最常用的。
 *
 * 核心参数：
 *   chunkSize: 每个 chunk 的目标大小（tokens）
 *   overlap:   相邻 chunk 的重叠量（保持上下文连续性）
 *
 * 为什么 overlap 重要：
 *   "React.memo 可以防止不必要的重渲染。结合 useCallback..."
 *   如果恰好在 "重渲染。" 和 "结合" 之间切断，后一个 chunk 开头丢失主语。
 *   overlap 让后 chunk 的开头包含前 chunk 的结尾，保持语义完整。
 */

export interface Chunk {
  content: string;
  metadata: {
    index: number; // chunk 序号
    startChar: number; // 原文中的起始位置
    endChar: number;
    tokenEstimate: number;
  };
}

export interface ChunkerConfig {
  /** 目标 chunk 大小（字符数，粗略估算 tokens = chars / 2） */
  chunkSize?: number;
  /** chunk 间重叠字符数 */
  overlap?: number;
  /** 自定义分割符（按优先级排序，从粗到细） */
  separators?: string[];
}

const DEFAULT_SEPARATORS = [
  "\n\n", // 段落
  "\n", // 换行
  "。", // 中文句号
  ". ", // 英文句号
  "；", // 中文分号
  "; ", // 英文分号
  "，", // 中文逗号
  ", ", // 英文逗号
  " ", // 空格
  "", // 逐字符（最后的 fallback）
];

export class RecursiveChunker {
  private chunkSize: number;
  private overlap: number;
  private separators: string[];

  constructor(config: ChunkerConfig = {}) {
    this.chunkSize = config.chunkSize || 800; // ~400 tokens
    this.overlap = config.overlap || 100; // ~50 tokens
    this.separators = config.separators || DEFAULT_SEPARATORS;
  }

  /**
   * 切分文本为 chunks
   */
  split(text: string): Chunk[] {
    const chunks: Chunk[] = [];
    const splits = this._recursiveSplit(text, this.separators);
    const merged = this._mergeSplits(splits);

    let charOffset = 0;
    for (let i = 0; i < merged.length; i++) {
      const content = merged[i];
      const startChar = text.indexOf(content, charOffset);
      const endChar = startChar + content.length;
      charOffset = endChar;

      chunks.push({
        content,
        metadata: {
          index: i,
          startChar,
          endChar,
          tokenEstimate: Math.round(content.length * 0.5), // 粗略估算
        },
      });
    }

    return chunks;
  }

  /**
   * 递归分割：按当前分割符切分，过长则用下一级分割符继续切
   */
  private _recursiveSplit(text: string, separators: string[]): string[] {
    const [sep, ...rest] = separators;

    // 无需分割
    if (text.length <= this.chunkSize || !sep) {
      return [text];
    }

    // sep === "" 表示逐字符切割（最后的 fallback）
    if (sep === "") {
      const result: string[] = [];
      for (let i = 0; i < text.length; i += this.chunkSize) {
        result.push(text.slice(i, i + this.chunkSize));
      }
      return result;
    }

    // 按当前分割符切分
    const parts = text.split(sep);
    const result: string[] = [];

    for (const part of parts) {
      if (part.length <= this.chunkSize) {
        if (part.trim()) result.push(part);
      } else if (rest.length > 0) {
        // 仍然过长，用下一级分割符递归切
        result.push(...this._recursiveSplit(part, rest));
      } else {
        // 无更细分割符，强制按长度切
        for (let i = 0; i < part.length; i += this.chunkSize) {
          result.push(part.slice(i, i + this.chunkSize));
        }
      }
    }

    return result;
  }

  /**
   * 合并过小的 splits 并创建 overlap
   */
  private _mergeSplits(splits: string[]): string[] {
    const merged: string[] = [];
    let current = "";

    for (const split of splits) {
      if (!split.trim()) continue;

      if ((current + split).length > this.chunkSize && current) {
        merged.push(current.trim());
        // overlap：新 chunk 包含上一 chunk 的尾部
        const overlapText =
          current.length > this.overlap
            ? current.slice(-this.overlap)
            : current;
        current = overlapText + " " + split;
      } else {
        current = current ? current + " " + split : split;
      }
    }

    if (current.trim()) {
      merged.push(current.trim());
    }

    return merged;
  }
}
