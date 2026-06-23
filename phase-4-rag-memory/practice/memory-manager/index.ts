/**
 * Agent 记忆管理器
 *
 * 设计理念（对应 theory/03-context-memory-management.md §3）：
 *   三层记忆模型——工作记忆、短期记忆、长期记忆。
 *   每一层有不同的存储、生命周期和检索策略。
 *
 * 运行：npm run memory
 *
 * 架构：
 *   ┌─────────────────────────────────────────────┐
 *   │              MemoryManager                    │
 *   ├───────────────┬──────────────┬────────────────┤
 *   │  工作记忆      │  短期记忆     │  长期记忆       │
 *   │  (messages[])  │  (session)   │  (VectorStore)  │
 *   │  上下文数组    │  摘要+进度   │  永久知识库     │
 *   └───────────────┴──────────────┴────────────────┘
 */

import { VectorStore } from "../vector-db/vector-store.js";
import { createEmbedder } from "../rag-pipeline/embedder.js";
import { createLLMClient } from "../../../phase-3-prompt-eng/practice/api-client/index.js";

// ===== Types =====

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
}

interface MemoryItem {
  key: string;
  value: any;
  type: "semantic" | "episodic" | "preference";
  timestamp: number;
  metadata?: Record<string, any>;
}

interface ContextConfig {
  systemPrompt: string;
  maxTokens: number;
  recentKeep: number; // 保留最近 N 条原文
}

// ===== MemoryManager =====

export class MemoryManager {
  // 工作记忆：当前 context 中的 messages
  private workingMemory: Message[] = [];

  // 短期记忆：本次会话的全部历史 + 摘要
  private shortTermHistory: Message[] = [];
  private shortTermSummary: string = "";

  // 长期记忆：向量库持久化
  private longTermStore: VectorStore;
  private embedder = createEmbedder("mock", { dimensions: 1024 });

  // 配置
  private config: ContextConfig;

  constructor(
    config: ContextConfig,
    longTermDimensions: number = 1024
  ) {
    this.config = config;
    this.longTermStore = new VectorStore({
      dimensions: longTermDimensions,
      metric: "cosine",
    });

    // System Prompt 常驻工作记忆
    this.workingMemory.push({
      role: "system",
      content: config.systemPrompt,
      timestamp: Date.now(),
    });
  }

  // ===== 工作记忆 ====  //

  addToWorkingMemory(message: Message): void {
    this.workingMemory.push(message);
    // 同时记录到短期历史
    this.shortTermHistory.push(message);
    // 检查是否需要压缩
    this._checkBudget();
  }

  getWorkingMemory(): Message[] {
    return this.workingMemory;
  }

  /** 清空工作记忆（保留 System Prompt） */
  resetWorkingMemory(): void {
    this.workingMemory = this.workingMemory.filter(
      (m) => m.role === "system"
    );
  }

  // ===== 短期记忆 ====  //

  /** 触发摘要压缩 */
  async compressShortTerm(): Promise<string> {
    const toCompress = this.shortTermHistory.slice(
      0,
      -this.config.recentKeep
    );

    if (toCompress.length === 0) return "";

    const llm = createLLMClient();
    const result = await llm.chat([
      {
        role: "system",
        content:
          "将以下对话历史压缩为一段简洁的摘要。保留关键决策、用户偏好、任务进度。不要遗漏任何重要信息。",
      },
      {
        role: "user",
        content: toCompress
          .map((m) => `[${m.role}] ${m.content}`)
          .join("\n"),
      },
    ]);

    this.shortTermSummary = result.content;
    return result.content;
  }

  getShortTermSummary(): string {
    return this.shortTermSummary;
  }

  // ===== 长期记忆 ====  //

  /**
   * 将信息存入长期记忆
   *
   * @param key - 唯一标识，如 "user-pref-typescript"
   * @param value - 记忆内容
   * @param type - 语义记忆/情节记忆/偏好
   */
  async remember(
    key: string,
    value: any,
    type: "semantic" | "episodic" | "preference" = "semantic"
  ): Promise<void> {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const embedding = await this.embedder.encode(text);

    this.longTermStore.add(key, embedding, {
      value: text,
      type,
      timestamp: Date.now(),
    });
  }

  /**
   * 从长期记忆中检索相关信息
   *
   * @param query - 自然语言查询
   * @param type - 过滤记忆类型，不传则全检索
   * @param topK - 返回 Top-K 条
   */
  async recall(
    query: string,
    type?: "semantic" | "episodic" | "preference",
    topK: number = 5
  ): Promise<MemoryItem[]> {
    const qVec = await this.embedder.encode(query);
    let results = this.longTermStore.search(qVec, topK);

    // 类型过滤
    if (type) {
      results = results.filter((r) => r.metadata.type === type);
    }

    return results
      .filter((r) => r.score > 0.1) // 相关度阈值
      .map((r) => ({
        key: r.id,
        value: r.metadata.value,
        type: r.metadata.type as MemoryItem["type"],
        timestamp: r.metadata.timestamp,
        score: r.score,
      })) as any;
  }

  async forget(key: string): Promise<void> {
    this.longTermStore.delete(key);
  }

  // ===== Context 组装 =====

  /**
   * 组装最终 Context——把三层记忆拼成 LLM 的输入
   *
   * 这是 MemoryManager 最核心的方法。每次 LLM 调用前调用它。
   */
  async assembleContext(userInput: string): Promise<Message[]> {
    const context: Message[] = [];

    // 1. System Prompt
    const sysPrompt = this.workingMemory.find((m) => m.role === "system");
    if (sysPrompt) {
      context.push({ ...sysPrompt });
    }

    // 2. 长期记忆注入
    const relevant = await this.recall(userInput);
    if (relevant.length > 0) {
      context.push({
        role: "system",
        content: `[Memory] 已知相关信息：\n${relevant
          .map(
            (m) =>
              `- [${m.type}] ${typeof m.value === "string" ? m.value.slice(0, 200) : m.value}`
          )
          .join("\n")}`,
        timestamp: Date.now(),
      });
    }

    // 3. 短期记忆摘要
    if (this.shortTermSummary) {
      context.push({
        role: "system",
        content: `[History] 对话摘要：${this.shortTermSummary}`,
        timestamp: Date.now(),
      });
    }

    // 4. 最近消息（原文）
    const recent = this.shortTermHistory.slice(-this.config.recentKeep);
    context.push(...recent);

    // 5. 当前用户输入
    context.push({
      role: "user",
      content: userInput,
      timestamp: Date.now(),
    });

    return context;
  }

  // ===== Internal =====

  /** Token 预算检查 */
  private _checkBudget(): void {
    const estimatedTokens = this.workingMemory.reduce(
      (sum, m) => sum + Math.round(m.content.length * 0.5),
      0
    );

    if (estimatedTokens > this.config.maxTokens * 0.7) {
      console.warn(
        `⚠️  Context 使用率: ${Math.round((estimatedTokens / this.config.maxTokens) * 100)}%，建议触发压缩`
      );
    }
  }

  /** 获取记忆系统统计 */
  stats(): {
    working: { messages: number; estimatedTokens: number };
    shortTerm: { messages: number; hasSummary: boolean };
    longTerm: { size: number };
  } {
    return {
      working: {
        messages: this.workingMemory.length,
        estimatedTokens: this.workingMemory.reduce(
          (s, m) => s + Math.round(m.content.length * 0.5),
          0
        ),
      },
      shortTerm: {
        messages: this.shortTermHistory.length,
        hasSummary: this.shortTermSummary.length > 0,
      },
      longTerm: { size: this.longTermStore.size },
    };
  }
}

// ===== Demo =====

async function main() {
  console.log("\n🧠 Agent 记忆管理器 Demo\n");
  console.log("=".repeat(65));

  // 1. 创建记忆管理器
  console.log("\n📦 1. 初始化 MemoryManager\n");

  const memory = new MemoryManager({
    systemPrompt:
      "你是 Chance 的 AI 助手。用户偏好 TypeScript + React。",
    maxTokens: 4000,
    recentKeep: 4,
  });

  console.log("   System Prompt 已注入工作记忆");
  console.log(`   配置: maxTokens=4000, recentKeep=4`);

  // 2. 存入长期记忆
  console.log("\n💾 2. 存入长期记忆\n");

  await memory.remember(
    "user-pref-ts",
    { language: "TypeScript", framework: "React", stateManagement: "Zustand" },
    "preference"
  );
  console.log('   ✅ "用户偏好: TypeScript + React + Zustand" → 长期记忆');

  await memory.remember(
    "user-pref-style",
    "用户喜欢先理论再实践，每个阶段结束要更新 PLAN.md 和 TODO.md",
    "preference"
  );
  console.log('   ✅ "用户学习风格" → 长期记忆');

  await memory.remember(
    "project-phase",
    "当前在阶段 4（Agent 记忆与 RAG），已完成 3 个阶段",
    "episodic"
  );
  console.log('   ✅ "项目进度" → 长期记忆');

  await memory.remember(
    "mcp-design",
    "MCP 是 AI 世界的 USB 协议——Server 提供工具，Client 发现和调用。Tool 是动作，Resource 是数据。",
    "semantic"
  );
  console.log('   ✅ "MCP 核心理解" → 长期记忆\n');

  // 3. 检索长期记忆
  console.log("🔍 3. 检索长期记忆\n");

  const queries = [
    "用户喜欢什么技术栈？",
    "项目现在进展到哪了？",
    "MCP 是什么？",
  ];

  for (const q of queries) {
    console.log(`   Query: "${q}"`);
    const results = await memory.recall(q, undefined, 2);
    results.forEach((r, i) => {
      const val =
        typeof r.value === "string" ? r.value.slice(0, 80) : JSON.stringify(r.value).slice(0, 80);
      console.log(`     ${i + 1}. [${r.type}] ${val}... (${r.score?.toFixed(3) || "N/A"})`);
    });
    console.log();
  }

  // 4. 模拟多轮对话
  console.log("💬 4. 模拟 Agent 对话\n");

  const conversation = [
    { role: "user" as const, content: "帮我审查这段 TypeScript 代码" },
    { role: "assistant" as const, content: "好的，请发送代码。我会重点关注类型安全和性能。" },
    { role: "user" as const, content: "代码中有一个 any 类型，需要改成泛型吗？" },
    { role: "assistant" as const, content: "是的，建议改成泛型。例如 function identity<T>(arg: T): T。这样可以保持类型安全。" },
    { role: "user" as const, content: "这个 React 组件渲染很慢，怎么办？" },
    { role: "assistant" as const, content: "可以用 React.memo 包裹，配合 useMemo 和 useCallback 减少重渲染。另外检查一下是否有不必要的 state 更新。" },
  ];

  for (const msg of conversation) {
    memory.addToWorkingMemory({
      ...msg,
      timestamp: Date.now(),
    });
    console.log(`   [${msg.role}] ${msg.content.slice(0, 60)}...`);
  }

  // 5. 查看记忆状态
  console.log("\n📊 5. 记忆系统状态\n");
  const stats = memory.stats();
  console.log(`   工作记忆: ${stats.working.messages} 条 (~${stats.working.estimatedTokens} tokens)`);
  console.log(`   短期记忆: ${stats.shortTerm.messages} 条, 摘要: ${stats.shortTerm.hasSummary ? "✅" : "❌"}`);
  console.log(`   长期记忆: ${stats.longTerm.size} 条`);

  // 6. 触发压缩
  console.log("\n🗜️  6. 触发短期记忆压缩\n");
  const summary = await memory.compressShortTerm();
  console.log(`   摘要: ${summary.slice(0, 200)}...`);

  // 7. 组装最终 Context
  console.log("\n📋 7. 组装 Context（最终 LLM 输入）\n");

  const context = await memory.assembleContext("泛型约束怎么写？");
  context.forEach((msg, i) => {
    const preview = msg.content.slice(0, 100).replace(/\n/g, " ");
    const label = msg.role === "system" && msg.content.startsWith("[Memory]")
      ? "system [Memory]"
      : msg.role === "system" && msg.content.startsWith("[History]")
        ? "system [History]"
        : msg.role;
    console.log(`   [${i}] ${label}: ${preview}...`);
  });

  console.log(
    `\n   Context 总计: ${context.length} 条消息`
  );

  // 8. 最终统计
  console.log("\n📊 8. 压缩后统计\n");
  const finalStats = memory.stats();
  console.log(`   工作记忆: ${finalStats.working.messages} 条 (~${finalStats.working.estimatedTokens} tokens)`);
  console.log(`   短期记忆: ${finalStats.shortTerm.messages} 条, 摘要: ${finalStats.shortTerm.hasSummary ? "✅" : "❌"}`);
  console.log(`   长期记忆: ${finalStats.longTerm.size} 条`);

  console.log("\n" + "=".repeat(65));
  console.log(
    "\n💡 三层记忆模型对应 theory/03 的核心设计："
  );
  console.log("   工作记忆 = 当前 Context 中的 messages（容量 4K tokens）");
  console.log("   短期记忆 = 本次会话历史 + LLM 压缩摘要（容量 会话级）");
  console.log("   长期记忆 = 向量库中的持久化知识（容量 无限）\n");
}

main().catch((err) => {
  console.error("❌ Memory manager error:", err);
  process.exit(1);
});
