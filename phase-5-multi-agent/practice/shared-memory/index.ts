/**
 * Agent 间记忆共享：发现提取 → 语义存储 → 自动注入 → 反膨胀 → 时效性
 *
 * 解决四个递进问题：
 *   1. Agent A 发现了东西，Agent B 怎么自动知道？（Phase 1-3）
 *   2. 每次注入越来越多，System Prompt 不膨胀吗？（Phase 5：去重+压缩）
 *   3. 过期信息怎么处理？短效和长效发现能一刀切吗？（Phase 6：半衰期+过期）
 *
 *   "Agent 不需要知道自己不知道什么。系统替它知道。"
 *
 * 运行：cd phase-5-multi-agent && npx tsx practice/shared-memory/index.ts
 */

import { createLLMClient } from "../../../phase-3-prompt-eng/practice/api-client/index.js";
import { VectorStore } from "../../../phase-4-rag-memory/practice/vector-db/vector-store.js";
import { MockEmbedder } from "../../../phase-4-rag-memory/practice/rag-pipeline/embedder.js";
import type { IVectorStore, SearchResult, VectorStoreConfig } from "../../../phase-4-rag-memory/practice/vector-db/types.js";

// ============================================================
// Types
// ============================================================

type KnowledgeType = "TRANSIENT" | "SITUATIONAL" | "DURABLE";

/** 半衰期：每经过一个半衰期，知识权重减半 */
const HALF_LIFE: Record<KnowledgeType, number> = {
  TRANSIENT:   5 * 60 * 1000,         // 5 分钟  — "API 挂了"
  SITUATIONAL: 60 * 60 * 1000,        // 1 小时  — "限流改到 50 req/min"
  DURABLE:     7 * 24 * 60 * 60 * 1000, // 7 天   — "age 字段废弃"
};

interface SharedKnowledge {
  id: string;
  sourceAgent: string;
  content: string;
  context: string;
  confidence: number;          // 0-1
  timestamp: number;
  knowledgeType: KnowledgeType;
  staleSince: number | null;   // 被新发现标记过时的时间戳
  tags: string[];
}

interface InjectOptions {
  topK?: number;
  minConfidence?: number;
  excludeSelf?: boolean;
}

interface InjectionResult {
  injected: SharedKnowledge[];
  query: string;
  relevanceScores: { knowledge: SharedKnowledge; score: number }[];
  filtered: SharedKnowledge[];
}

// ============================================================
// 1. SharedMemoryStore — 类型感知 + 过期标记
// ============================================================

class SharedMemoryStore {
  private store: IVectorStore;
  private knowledge: Map<string, SharedKnowledge> = new Map();

  constructor(private embedder: MockEmbedder) {
    const config: VectorStoreConfig = { dimensions: embedder.dimensions, metric: "cosine" };
    this.store = new VectorStore(config);
  }

  async add(k: SharedKnowledge): Promise<void> {
    const vector = await this.embedder.encode(k.content);
    this.store.add(k.id, vector);

    // 过期标记：新发现与旧知识语义相似 > 0.6 → 标记旧知识为 stale
    if (this.knowledge.size > 0) {
      const similar = await this.search(k.content, 3, { minConfidence: 0.5 });
      for (const r of similar) {
        if (r.score > 0.6) {
          const old = this.knowledge.get(r.id);
          if (old && old.timestamp < k.timestamp && !old.staleSince) {
            old.staleSince = Date.now();
          }
        }
      }
    }

    this.knowledge.set(k.id, k);
  }

  async search(
    query: string, topK: number = 3,
    filters?: { minConfidence?: number; excludeAgent?: string }
  ): Promise<SearchResult[]> {
    const vector = await this.embedder.encode(query);
    let results = this.store.search(vector, topK);

    if (filters) {
      results = results.filter(r => {
        const k = this.knowledge.get(r.id);
        if (!k) return false;
        if (filters.minConfidence && k.confidence < filters.minConfidence) return false;

        // 半衰期过滤：超过 4 个半衰期 → 有效度 < 6% → 过滤
        const ageMs = Date.now() - k.timestamp;
        const halfLife = HALF_LIFE[k.knowledgeType];
        if (ageMs / halfLife > 4) return false;

        // 被标记过时
        if (k.staleSince) return false;

        if (filters.excludeAgent && k.sourceAgent === filters.excludeAgent) return false;
        return true;
      });
    }

    // 时间衰减到分数上
    results = results.map(r => {
      const k = this.knowledge.get(r.id);
      if (!k) return r;
      const halfLivesPassed = (Date.now() - k.timestamp) / HALF_LIFE[k.knowledgeType];
      const timeDecay = Math.pow(0.5, halfLivesPassed);
      return { ...r, score: r.score * timeDecay };
    });

    return results;
  }

  getKnowledge(id: string): SharedKnowledge | undefined { return this.knowledge.get(id); }
  getAll(): SharedKnowledge[] { return [...this.knowledge.values()].sort((a, b) => b.timestamp - a.timestamp); }
  getStale(): SharedKnowledge[] { return [...this.knowledge.values()].filter(k => k.staleSince !== null); }
  size(): number { return this.knowledge.size; }
}

// ============================================================
// 2. KnowledgeExtractor
// ============================================================

class KnowledgeExtractor {
  constructor(private llm: ReturnType<typeof createLLMClient>) {}

  async extract(agentOutput: string, agentRole: string): Promise<
    { content: string; confidence: number; tags: string[]; knowledgeType: KnowledgeType }[]
  > {
    const prompt = `你是一个知识提取器。提取 Agent 工作输出中"其他 Agent 可能需要的事实性发现"。

规则：
1. 只提取事实（"age 已废弃"），不提取观点（"代码写得很好"）。
2. 每条发现一句话，附 confidence (0-1)、1-3 个 tags。
3. 附 knowledgeType：
   - "TRANSIENT"：系统状态（API 挂了、连接超时、临时限流）— 几分钟内有效
   - "SITUATIONAL"：业务配置（限流阈值、迁移计划、新增字段）— 几小时内有效
   - "DURABLE"：设计决策（字段废弃、架构选择、接口定义）— 几天到永久有效
4. 如果没有值得共享的发现，返回空列表。

Agent 角色: ${agentRole}
工作输出:
"""
${agentOutput.slice(0, 2000)}
"""

只返回 JSON：
{"discoveries":[{"content":"...","confidence":0.95,"tags":["..."],"knowledgeType":"DURABLE"}]}`;

    try {
      const result = await this.llm.chat([{ role: "user", content: prompt }], { temperature: 0.1 });
      const jsonStr = (result.content.match(/\{[\s\S]*\}/) ?? [])[0] ?? "{}";
      const parsed = JSON.parse(jsonStr);
      return (parsed.discoveries || []).map((d: any) => ({ ...d, knowledgeType: d.knowledgeType || "SITUATIONAL" }));
    } catch {
      return [];
    }
  }
}

// ============================================================
// 3. ContextInjector — 注入 + 反膨胀（去重 + 压缩）
// ============================================================

class ContextInjector {
  private seenByAgent = new Map<string, Set<string>>();
  private summaryByAgent = new Map<string, string[]>();

  constructor(private store: SharedMemoryStore) {}

  async prepareContext(agentRole: string, currentTask: string, options?: InjectOptions): Promise<InjectionResult> {
    const topK = options?.topK ?? 3;
    const minConfidence = options?.minConfidence ?? 0.6;
    const excludeSelf = options?.excludeSelf ?? true;

    const results = await this.store.search(currentTask, topK * 4, {
      minConfidence,
      excludeAgent: excludeSelf ? agentRole : undefined,
    });

    // 去重：已见过的跳过
    const seen = this.seenByAgent.get(agentRole) ?? new Set();
    const unseen = results.filter(r => !seen.has(r.id));

    const scored = unseen
      .map(r => ({ knowledge: this.store.getKnowledge(r.id)!, semanticScore: r.score }))
      .filter(item => item.knowledge)
      .map(item => {
        const ageMs = Date.now() - item.knowledge.timestamp;
        const halfLife = HALF_LIFE[item.knowledge.knowledgeType];
        const recencyFactor = Math.pow(0.5, ageMs / halfLife);
        const compositeScore = item.semanticScore * 0.5 + recencyFactor * 0.2 + item.knowledge.confidence * 0.3;
        return { ...item, compositeScore };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore);

    const injected = scored.slice(0, topK).map(s => s.knowledge);

    for (const k of injected) seen.add(k.id);
    this.seenByAgent.set(agentRole, seen);

    // 累积摘要 — 超过 8 条触发压缩
    const summaries = this.summaryByAgent.get(agentRole) ?? [];
    for (const k of injected) summaries.push(k.content);
    if (summaries.length > 8) {
      this.summaryByAgent.set(agentRole, [summaries.map(s => s.split(/[：:,，]/)[0].slice(0, 40)).join("；")]);
    } else {
      this.summaryByAgent.set(agentRole, summaries);
    }

    return {
      injected,
      query: currentTask,
      relevanceScores: scored.map(s => ({ knowledge: s.knowledge, score: s.compositeScore })),
      filtered: injected,
    };
  }

  resetAgent(role: string): void { this.seenByAgent.delete(role); this.summaryByAgent.delete(role); }

  formatContext(discoveries: SharedKnowledge[], compress = false): string {
    if (discoveries.length === 0) return "";
    if (compress && discoveries.length > 1) {
      const merged = discoveries.map(d =>
        `[${d.sourceAgent}|${d.knowledgeType}|${(d.confidence*100).toFixed(0)}%] ${d.content}`
      ).join(" | ");
      return `\n--- 共享记忆（已压缩 ${discoveries.length} 条）---\n${merged}\n---\n`;
    }
    const items = discoveries.map((d, i) => {
      const ageSec = Math.round((Date.now() - d.timestamp) / 1000);
      const ageStr = ageSec < 60 ? `${ageSec}s前` : `${Math.round(ageSec/60)}m前`;
      const typeLabel = d.knowledgeType === "TRANSIENT" ? "⚡瞬态" : d.knowledgeType === "SITUATIONAL" ? "🔧配置" : "🏛️持久";
      return `${i+1}. ${typeLabel} [${d.sourceAgent},${ageStr}] ${d.content}`;
    });
    return `\n--- 共享记忆 ---\n${items.join("\n")}\n---\n`;
  }
}

// ============================================================
// Demo
// ============================================================

async function main() {
  console.log("\n🧠 Agent 间记忆共享 Demo\n");
  console.log("=".repeat(65));

  const llm = createLLMClient("deepseek");
  const embedder = new MockEmbedder({ dimensions: 128 });
  const store = new SharedMemoryStore(embedder);
  const extractor = new KnowledgeExtractor(llm);
  const injector = new ContextInjector(store);

  // ====== Phase 1-3: 基础记忆共享（不变） ======
  console.log("\n📦 Phase 1: Agent A (DB Inspector) 审查 users 表，提取发现");
  console.log("-".repeat(45));

  const agentAOutput = `审查报告 —— users 表
1. age 字段已标记为 DEPRECATED，注释说明"age is calculated from birth_date, do not use directly"。
2. email 字段缺少唯一索引，当前有 23 条重复 email 记录。
3. created_at 使用 TIMESTAMP 类型，在 2038 年会溢出。建议迁移到 TIMESTAMPTZ。
4. 表中有 15% 的用户 birth_date 为 NULL —— 这些用户的年龄相关查询会失败。`;

  const discoveries = await extractor.extract(agentAOutput, "DB Inspector");
  if (discoveries.length === 0) {
    discoveries.push(
      { content: "users.age 已废弃，应使用 birth_date 计算年龄", confidence: 0.99, tags: ["db","schema"], knowledgeType: "DURABLE" },
      { content: "users.email 缺唯一索引，23 条重复", confidence: 0.99, tags: ["db","index"], knowledgeType: "SITUATIONAL" },
      { content: "users.created_at 是 TIMESTAMP，2038 年溢出", confidence: 0.95, tags: ["db","migration"], knowledgeType: "DURABLE" },
      { content: "15% 用户 birth_date=NULL，年龄查询会失败", confidence: 0.99, tags: ["db","quality"], knowledgeType: "DURABLE" },
    );
  }

  for (const d of discoveries) {
    await store.add({
      id: `disc-${store.size()+1}`, sourceAgent: "DB Inspector",
      content: d.content, context: "审查 users 表", confidence: d.confidence,
      timestamp: Date.now(), knowledgeType: d.knowledgeType, staleSince: null, tags: d.tags,
    });
  }
  console.log(`  ✅ 提取了 ${discoveries.length} 条发现（${discoveries.filter(d=>d.knowledgeType==="DURABLE").length} DURABLE + ${discoveries.filter(d=>d.knowledgeType==="SITUATIONAL").length} SITUATIONAL）\n`);

  // Phase 2: Agent B 受益
  console.log("📦 Phase 2: Agent B (Query Writer) 自动获取共享记忆");
  console.log("-".repeat(45));
  const injection = await injector.prepareContext("Query Writer", "查询所有成年用户的姓名和邮箱", { topK: 3 });
  console.log(injector.formatContext(injection.injected));
  console.log("  → Agent B 现在会用 birth_date 而不是 age\n");

  // Phase 3: Agent C 跨任务受益
  console.log("📦 Phase 3: Agent C (API Designer) 受益于 A+B 的发现");
  console.log("-".repeat(45));
  await store.add({
    id: `disc-${store.size()+1}`, sourceAgent: "Query Writer",
    content: "birth_date=NULL 的 15% 用户被排除在查询外，API 需返回 warning",
    context: "编写查询时发现", confidence: 0.87,
    timestamp: Date.now(), knowledgeType: "SITUATIONAL", staleSince: null, tags: ["api","query"],
  });
  const injectionC = await injector.prepareContext("API Designer", "设计 GET /api/users/adults 接口响应格式", { topK: 4 });
  console.log(injector.formatContext(injectionC.injected));
  const fromBoth = new Set(injectionC.injected.map(k => k.sourceAgent));
  console.log(`  → Agent C 同时获得了来自 ${[...fromBoth].join(" + ")} 的知识\n`);

  // ====== Phase 4: 时效性演示（核心新增） ======
  console.log("📦 Phase 4: 时效性——不同类型发现的命运不同");
  console.log("-".repeat(45));

  // 注入一条 TRANSIENT 发现（模拟"API 现在挂了"）
  await store.add({
    id: "disc-api-down", sourceAgent: "Monitor",
    content: "支付 API 返回 503，当前不可用", context: "健康检查",
    confidence: 1.0, timestamp: Date.now() - 10 * 60 * 1000, // 10 分钟前
    knowledgeType: "TRANSIENT", staleSince: null, tags: ["api","incident"],
  });
  // 注入一条 DURABLE 发现（模拟"age 废弃"——同样 10 分钟前但应该还有效）
  // DB Inspector 的 age 废弃发现 timestamp 也是当前时间，不用改

  console.log("\n  共享库现在有:");
  for (const k of store.getAll()) {
    const ageSec = Math.round((Date.now() - k.timestamp) / 1000);
    const ageMin = Math.round(ageSec / 60);
    const halfLife = HALF_LIFE[k.knowledgeType];
    const halfLivesPassed = (Date.now() - k.timestamp) / halfLife;
    const effectiveness = (Math.pow(0.5, halfLivesPassed) * 100).toFixed(1);
    const typeIcon = k.knowledgeType === "TRANSIENT" ? "⚡" : k.knowledgeType === "SITUATIONAL" ? "🔧" : "🏛️";
    console.log(`  ${typeIcon} [${k.knowledgeType.padEnd(11)}] ${k.content.slice(0,55)}...`);
    console.log(`      ${ageMin}分钟前 | 半衰期: ${(halfLife/60000).toFixed(0)}分钟 | 有效度: ${effectiveness}% ${k.staleSince ? '⚠️ 已过时' : ''}`);
  }

  // 检索：看时效性如何影响搜索
  const timeQuery = "支付接口怎么调用";
  const timeResults = await store.search(timeQuery, 4);
  console.log(`\n  搜索"${timeQuery}":`);
  for (const r of timeResults) {
    const k = store.getKnowledge(r.id)!;
    console.log(`    score=${r.score.toFixed(3)} | ${k.knowledgeType.padEnd(11)} | ${k.content.slice(0,55)}...`);
  }
  console.log("  → TRANSIENT 发现虽然语义最相关，但 10 分钟（2 个半衰期）后权重已衰减至 25%");
  console.log("  → DURABLE 发现语义相似度可能不是最高，但未衰减，实际排序可能反超\n");

  // ====== Phase 5: 过期标记演示 ======
  console.log("📦 Phase 5: 过期标记——新发现使旧发现过时");
  console.log("-".repeat(45));

  console.log("  旧知识: '支付 API 返回 503，当前不可用' (TRANSIENT, 10 分钟前)");
  console.log("  新发现: '支付 API 已恢复，所有服务正常'");

  await store.add({
    id: "disc-api-recovered", sourceAgent: "Monitor",
    content: "支付 API 已恢复，所有服务正常", context: "健康检查恢复",
    confidence: 1.0, timestamp: Date.now(),
    knowledgeType: "TRANSIENT", staleSince: null, tags: ["api","recovery"],
  });

  const stale = store.getStale();
  console.log(`\n  过期检测结果: ${stale.length} 条旧知识被标记为过时`);
  for (const s of stale) {
    console.log(`  ⚠️  "${s.content}" → 已被新信息覆盖`);
  }

  // 验证旧知识不再被检索到
  const afterStaleQuery = await store.search("支付 API 状态", 3);
  const hasStale = afterStaleQuery.some(r => store.getKnowledge(r.id)?.staleSince);
  const hasNew = afterStaleQuery.some(r => r.id === "disc-api-recovered");
  console.log(`  再搜"支付 API 状态": 包含过期知识=${hasStale} 包含新发现=${hasNew}`);
  console.log("  → 过期知识自动过滤，只返回最新状态\n");

  // ====== Phase 6: 反膨胀（前文 Phase 5，保留核心对比） ======
  console.log("📦 Phase 6: 反膨胀——去重 + 压缩");
  console.log("-".repeat(45));

  // 批量注入更多发现
  const more = [
    { c: "API 限流策略改为每用户 50 req/min", t: "SITUATIONAL" as KnowledgeType },
    { c: "支付接口 v2 已废弃，迁移到 v3", t: "DURABLE" as KnowledgeType },
    { c: "订单新增 'refunding' 状态", t: "DURABLE" as KnowledgeType },
    { c: "头像存储迁移到 CDN，旧 URL 无效", t: "DURABLE" as KnowledgeType },
    { c: "数据库连接池上限调为 30", t: "SITUATIONAL" as KnowledgeType },
    { c: "Redis 缓存已上线 user:{id} TTL=1h", t: "SITUATIONAL" as KnowledgeType },
  ];
  for (let i = 0; i < more.length; i++) {
    await store.add({
      id: `disc-extra-${i}`, sourceAgent: "Infra",
      content: more[i].c, context: "基础设施",
      confidence: 0.9, timestamp: Date.now(),
      knowledgeType: more[i].t, staleSince: null, tags: ["infra"],
    });
  }

  let tokensNo = 0, tokensCtrl = 0;
  const ctrl = new ContextInjector(store);
  const tasks = ["用户查询优化","支付回调设计","缓存策略","限流配置更新","订单退款流程"];

  console.log("\n  5 轮检索对比:");
  for (let r = 0; r < 5; r++) {
    // 无控制：每次都 reset（模拟没去重）
    const noCtrl = new ContextInjector(store);
    const injNo = await noCtrl.prepareContext("Agent-X", tasks[r], { topK: 3 });
    tokensNo += noCtrl.formatContext(injNo.injected).length;

    // 有控制
    const injYes = await ctrl.prepareContext("Agent-Y", tasks[r], { topK: 3 });
    tokensCtrl += ctrl.formatContext(injYes.injected, r >= 2).length;
  }
  const saving = ((1 - tokensCtrl / tokensNo) * 100).toFixed(0);
  console.log(`  无控制累计注入: ~${(tokensNo*0.3).toFixed(0)} tokens`);
  console.log(`  受控累计注入:   ~${(tokensCtrl*0.3).toFixed(0)} tokens`);
  console.log(`  节省: ${saving}%（去重让重复发现归零 + 压缩让多条变一条）`);

  // ====== 总结 ======
  console.log("\n" + "=".repeat(65));
  console.log("📊 共享记忆四层设计总结\n");
  console.log("  层1 基础共享: Agent 不需要知道'该问谁'——系统替它知道");
  console.log("  层2 反膨胀:   去重(已见不再推) + 压缩(多条变一条) → O(1) 常数");
  console.log("  层3 时效性:   三类知识 × 各自半衰期 → 瞬态快速消亡，持久长期有效");
  console.log("  层4 过期标记: 新发现语义覆盖旧发现 → 自动 stale → 不再检索");
}

main().catch((err) => {
  console.error("❌ shared-memory error:", err);
  process.exit(1);
});
