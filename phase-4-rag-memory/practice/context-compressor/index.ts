/**
 * 上下文压缩器
 *
 * 设计理念（对应 theory/03-context-memory-management.md §4）：
 *   当对话历史或检索结果太长时，不是粗暴截断，而是智能压缩——
 *   保留关键信息，丢弃冗余修饰。
 *
 * 三种压缩策略：
 *   1. LLM 摘要压缩 —— 用 LLM 把长文本压缩成摘要
 *   2. 选择性上下文 —— 用 embedding 找出最相关的消息
 *   3. Token 预算管理器 —— 根据预算动态决定保留什么
 *
 * 运行：npm run compress
 */

import { createLLMClient } from "../../../phase-3-prompt-eng/practice/api-client/index.js";
import { createEmbedder } from "../rag-pipeline/embedder.js";

// ===== Strategy 1: LLM 摘要压缩 =====

interface CompressOptions {
  /** 目标 token 数（压缩后） */
  targetTokens?: number;
  /** 压缩风格 */
  style?: "dense" | "bullets" | "keywords";
}

/**
 * 用 LLM 将长文本压缩为简洁摘要
 *
 * 原理（LLMLingua 风格）：
 *   LLM 理解文本后，重新用更少的 token 表达相同语义。
 *   这不是"选择哪些句子保留"，而是"用更简洁的语言重写"。
 *
 * 效率：通常可压缩 60-80%，同时保留 >95% 的关键信息。
 */
async function llmCompress(
  text: string,
  options: CompressOptions = {}
): Promise<{ compressed: string; compressionRatio: number }> {
  const { targetTokens = 150, style = "dense" } = options;

  const stylePrompts: Record<string, string> = {
    dense: "用极简的语句重写，删除所有修饰词和冗余描述，只保留核心事实和关键结论。",
    bullets: "转换为要点列表（bullet points），每条不超过 15 字。",
    keywords:
      "提取 5-10 个关键短语，逗号分隔。同时保留 1 句话的核心结论。",
  };

  const llm = createLLMClient();
  const result = await llm.chat([
    {
      role: "system",
      content: `你是文本压缩专家。${stylePrompts[style]}\n\n规则：\n- 不能添加原文没有的信息\n- 不能遗漏关键事实\n- 目标 token 数：约 ${targetTokens}`,
    },
    { role: "user", content: `压缩以下文本：\n\n${text}` },
  ]);

  const compressed = result.content;
  const compressionRatio = compressed.length / text.length;

  return { compressed, compressionRatio };
}

// ===== Strategy 2: 选择性上下文 =====

interface MessageItem {
  role: string;
  content: string;
}

/**
 * 从长对话历史中选择与当前问题最相关的 N 条消息
 *
 * 原理：对每条历史消息做 embedding，与当前问题的 embedding
 * 做余弦相似度排序，取 Top-N。这比简单的"保留最近 N 条"更聪明——
 * 比如 50 轮前用户说"我使用 React 17"，而当前问题是"React 18 升级步骤"，
 * 那条老消息会被检索出来，不会被遗忘。
 */
async function selectRelevantMessages(
  currentQuestion: string,
  history: MessageItem[],
  topN: number = 5
): Promise<MessageItem[]> {
  const embedder = createEmbedder("mock", { dimensions: 1024 });

  // 对每条历史消息做 embedding
  const historyEmbeddings = await embedder.encodeBatch(
    history.map((m) => `${m.role}: ${m.content}`)
  );

  // 对当前问题做 embedding
  const questionEmbedding = await embedder.encode(
    `user: ${currentQuestion}`
  );

  // 余弦相似度排序
  const scored = historyEmbeddings.map((emb, i) => ({
    index: i,
    score: cosineSimilarity(questionEmbedding, emb),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => history[s.index]);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ===== Strategy 3: Token 预算管理器 =====

interface BudgetItem {
  id: string;
  content: string;
  priority: "critical" | "high" | "medium" | "low";
  tokenEstimate: number;
}

/**
 * Token 预算管理器：在固定 token 预算内，按优先级分配空间
 *
 * 类比：旅行打包——先放必需品（critical），剩多少空间放多少可选品。
 */
class TokenBudgetManager {
  constructor(private maxTokens: number) {}

  allocate(items: BudgetItem[]): {
    included: BudgetItem[];
    excluded: BudgetItem[];
    usage: number;
  } {
    const sorted = [...items].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    });

    const included: BudgetItem[] = [];
    const excluded: BudgetItem[] = [];
    let used = 0;

    for (const item of sorted) {
      if (used + item.tokenEstimate <= this.maxTokens) {
        included.push(item);
        used += item.tokenEstimate;
      } else {
        excluded.push(item);
      }
    }

    return { included, excluded, usage: used };
  }
}

// ===== Demo =====

async function main() {
  console.log("\n🗜️  上下文压缩器 Demo\n");
  console.log("=".repeat(65));

  // --- Demo 1: LLM 摘要压缩 ---
  console.log("\n📝 策略 1: LLM 摘要压缩\n");

  const longText = `
React 18 是一个非常重要的版本更新，它引入了许多令人兴奋的新特性。
其中最重要的就是并发特性（Concurrent Features），这是 React 渲染模型的一次根本性变革。
并发渲染允许 React 在渲染过程中中断和恢复工作，这意味着 React 可以为高优先级的更新
（比如用户输入）让路，而不是像以前那样必须一口气完成整个渲染过程。

具体来说，React 18 提供了 useTransition 和 useDeferredValue 这两个新的 Hook，
它们让开发者可以手动标记哪些更新是低优先级的。比如，当用户在搜索框中输入时，
输入框本身的更新是高优先级的（用户期望即时反馈），但搜索结果的渲染可以标记为低优先级。

此外，React 18 还全面升级了 Suspense 的能力，支持了服务端流式渲染（Streaming SSR），
以及配合数据获取库（如 React Query 和 SWR）实现 Suspense for Data Fetching。
这些特性结合起来，让 React 应用的用户体验得到了质的提升——用户能看到更快的内容呈现，
交互也更加流畅。不过要充分发挥这些特性的威力，需要开发者对 React 的渲染模型有较深的理解。
  `.trim();

  console.log(`  原文: ${longText.length} 字符 (~${Math.round(longText.length * 0.5)} tokens)\n`);

  // Dense 压缩
  const dense = await llmCompress(longText, {
    targetTokens: 80,
    style: "dense",
  });
  console.log(`  📐 Dense 压缩 (${(dense.compressionRatio * 100).toFixed(0)}% 原始长度):`);
  console.log(`     ${dense.compressed}\n`);

  // Bullets 压缩
  const bullets = await llmCompress(longText, {
    targetTokens: 80,
    style: "bullets",
  });
  console.log(`  📋 Bullets 压缩 (${(bullets.compressionRatio * 100).toFixed(0)}% 原始长度):`);
  console.log(`     ${bullets.compressed}\n`);

  // --- Demo 2: 选择性上下文 ---
  console.log("🔍 策略 2: 选择性上下文检索\n");

  const history: MessageItem[] = [
    { role: "user", content: "我想学 Docker 部署" },
    { role: "assistant", content: "建议从 Dockerfile 和多阶段构建开始" },
    { role: "user", content: "React 和 Vue 哪个好？" },
    { role: "assistant", content: "取决于项目需求。React 生态更丰富。" },
    { role: "user", content: "我的 TypeScript 泛型报错了" },
    {
      role: "assistant",
      content: "请检查是否添加了 extends 约束。可以把代码发给我看看。",
    },
    { role: "user", content: "帮我写个 React Suspense 的例子" },
    { role: "assistant", content: "使用 <Suspense fallback={...}> 包裹懒加载组件。" },
  ];

  const question = "TypeScript 泛型约束怎么写？";
  console.log(`  对话历史: ${history.length} 条消息`);
  console.log(`  当前问题: "${question}"\n`);

  const relevant = await selectRelevantMessages(question, history, 3);
  console.log("  最相关的 3 条消息:");
  relevant.forEach((m, i) => {
    console.log(`    ${i + 1}. [${m.role}] ${m.content.slice(0, 60)}...`);
  });

  // --- Demo 3: Token 预算分配 ---
  console.log("\n💰 策略 3: Token 预算分配 (max 2000 tokens)\n");

  const budgetMgr = new TokenBudgetManager(2000);
  const items: BudgetItem[] = [
    {
      id: "system-prompt",
      content: "System Prompt (角色+规则)",
      priority: "critical",
      tokenEstimate: 400,
    },
    {
      id: "user-question",
      content: "当前用户问题",
      priority: "critical",
      tokenEstimate: 100,
    },
    {
      id: "rag-results",
      content: "RAG 检索结果 (3 chunks)",
      priority: "high",
      tokenEstimate: 800,
    },
    {
      id: "recent-msgs",
      content: "最近 5 轮对话",
      priority: "high",
      tokenEstimate: 600,
    },
    {
      id: "older-summary",
      content: "旧对话摘要",
      priority: "medium",
      tokenEstimate: 200,
    },
    {
      id: "full-history",
      content: "完整对话历史 (20 轮)",
      priority: "low",
      tokenEstimate: 3000,
    },
  ];

  const { included, excluded, usage } = budgetMgr.allocate(items);
  console.log(`  预算: 2000 tokens  |  已分配: ${usage} tokens  |  剩余: ${2000 - usage} tokens\n`);
  console.log("  ✅ 已放入 Context:");
  included.forEach((i) =>
    console.log(`     [${i.priority}] ${i.id} (${i.tokenEstimate} tokens)`)
  );
  console.log("\n  ❌ 被排除:");
  excluded.forEach((i) =>
    console.log(`     [${i.priority}] ${i.id} (${i.tokenEstimate} tokens)`)
  );

  console.log("\n" + "=".repeat(65));
  console.log(
    "\n💡 三种策略对应 theory/03 的三个核心机制："
  );
  console.log(
    "   摘要压缩 = 短期记忆压缩，选择性上下文 = 长期记忆检索，预算管理 = 工作记忆分配\n"
  );
}

main().catch((err) => {
  console.error("❌ Compressor error:", err);
  process.exit(1);
});
