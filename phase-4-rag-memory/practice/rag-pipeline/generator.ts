/**
 * 生成器——基于检索结果调用 LLM 生成答案
 *
 * 职责：
 *   1. 把检索到的文档拼成"增强 prompt"
 *   2. 调 LLM 生成答案
 *   3. 返回答案 + 引用来源
 *
 * 增强模式（对应 theory/02-rag-architecture.md §5）：
 *   - Stuff：所有文档直接拼入 prompt（当前实现）
 *   - Map-Reduce：每篇文档独立生成再汇总
 *   - Refine：迭代精炼
 */

import { createLLMClient } from "../../../phase-3-prompt-eng/practice/api-client/index.js";
import type { RetrievedDoc } from "./retriever.js";

export interface GenerationResult {
  answer: string;
  sources: { id: string; content: string; score: number }[];
  tokenUsage?: { input: number; output: number };
  latencyMs: number;
}

const SYSTEM_PROMPT = `你是一个基于文档的问答助手。规则：
1. 只基于提供的文档内容回答，不要使用文档以外的知识
2. 引用具体文档时，使用 [来源N] 标记
3. 如果文档不足以回答，明确说"根据提供的文档无法确定"
4. 答案简洁准确，使用中文`;

/**
 * 用检索到的文档增强 prompt 并调用 LLM 生成答案
 */
export async function generate(
  query: string,
  documents: RetrievedDoc[]
): Promise<GenerationResult> {
  // 构造增强 prompt
  const context = documents
    .map((d, i) => `[来源${i + 1}] (相关度: ${d.score.toFixed(2)})\n${d.content}`)
    .join("\n\n---\n\n");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `参考文档：\n\n${context}\n\n---\n问题：${query}`,
    },
  ];

  const start = Date.now();
  const llm = createLLMClient();
  const result = await llm.chat(messages);

  return {
    answer: result.content,
    sources: documents.map((d) => ({
      id: d.id,
      content: d.content.slice(0, 200),
      score: d.score,
    })),
    tokenUsage: result.usage,
    latencyMs: result.latencyMs,
  };
}

/**
 * Map-Reduce 增强模式（适合长文档场景）
 * Map: 对每个文档独立生成子答案
 * Reduce: 汇总子答案
 */
export async function generateMapReduce(
  query: string,
  documents: RetrievedDoc[]
): Promise<GenerationResult> {
  const llm = createLLMClient();

  // Map: 每篇文档独立生成
  const subAnswers: string[] = [];
  for (const doc of documents) {
    const result = await llm.chat([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `参考文档：\n${doc.content}\n\n问题：${query}\n\n基于以上文档回答（1-2 句话即可）：`,
      },
    ]);
    subAnswers.push(result.content);
  }

  // Reduce: 汇总
  const subContext = subAnswers
    .map((a, i) => `[子答案${i + 1}] ${a}`)
    .join("\n");

  const finalResult = await llm.chat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `以下是基于不同文档对同一个问题的回答，请整合成一个连贯的答案：\n\n${subContext}\n\n原始问题：${query}`,
    },
  ]);

  return {
    answer: finalResult.content,
    sources: documents.map((d) => ({
      id: d.id,
      content: d.content.slice(0, 200),
      score: d.score,
    })),
    latencyMs: finalResult.latencyMs,
  };
}
