/**
 * Agent Mesh — Agent 注册中心 + 通信协议
 *
 * 设计理念（对应 theory/01 §3、theory/02 §2-3）：
 *   Agent 之间通过结构化消息通信，Mesh 负责路由和协议转换。
 *   每个 Agent 通过注册表声明自己的能力和工具。
 *
 * 运行：npm run mesh
 */

import { createEmbedder } from "../../../phase-4-rag-memory/practice/rag-pipeline/embedder.js";

// ===== Types =====

interface AgentCapability {
  name: string;
  description: string;
  keywords: string[];
}

interface RegisteredAgent {
  id: string;
  name: string;
  role: string;
  capabilities: AgentCapability[];
  maxConcurrency: number;
  status: "idle" | "busy" | "offline";
}

interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: "task" | "result" | "query" | "handoff" | "error";
  payload: Record<string, any>;
  traceId: string;
  timestamp: number;
  ttl: number;
}

// ===== Agent Registry =====

class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();
  private messageLog: AgentMessage[] = [];
  private embedder = createEmbedder("mock", { dimensions: 1024 });

  register(agent: RegisteredAgent): void {
    this.agents.set(agent.id, agent);
    console.log(`   📝 注册: ${agent.name} (${agent.id})`);
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  list(): RegisteredAgent[] {
    return [...this.agents.values()];
  }

  /**
   * 语义路由：根据任务描述找到最匹配的 Agent
   *
   * 原理（theory/02 §2）：用 embedding 匹配任务描述和 Agent 能力描述。
   * 这比 switch-case 路由灵活得多——新增 Agent 无需改代码。
   */
  async findBestAgent(taskDescription: string): Promise<{
    agent: RegisteredAgent;
    score: number;
  } | null> {
    const available = [...this.agents.values()].filter(
      (a) => a.status !== "offline"
    );

    if (available.length === 0) return null;

    // 构造 Agent 能力描述文本
    const agentDescriptions = available.map((a) =>
      a.capabilities.map((c) => `${c.name}: ${c.description} (${c.keywords.join(", ")})`).join("; ")
    );

    // Embedding + 余弦相似度匹配
    const taskVec = await this.embedder.encode(taskDescription);
    const agentVecs = await this.embedder.encodeBatch(agentDescriptions);

    let bestIdx = 0;
    let bestScore = -1;

    for (let i = 0; i < agentVecs.length; i++) {
      const score = this._cosineSimilarity(taskVec, agentVecs[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    return { agent: available[bestIdx], score: bestScore };
  }

  private _cosineSimilarity(a: number[], b: number[]): number {
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
}

// ===== Message Router =====

class MessageRouter {
  constructor(private registry: AgentRegistry) {}

  /** 发送消息并等待回复 */
  async sendAndWait(
    message: AgentMessage,
    timeoutMs: number = 30000
  ): Promise<AgentMessage> {
    const receiver = this.registry.get(message.to);
    if (!receiver) {
      return this._errorReply(message, `Agent ${message.to} 不存在`);
    }

    // 记录消息
    console.log(
      `   ✉️  ${message.from} → ${message.to}: [${message.type}] ${JSON.stringify(message.payload).slice(0, 60)}...`
    );

    // 模拟消息传递（真实场景为 WebSocket/HTTP）
    return {
      id: `reply-${message.id}`,
      from: message.to,
      to: message.from,
      type: "result",
      payload: { ack: true, receivedBy: receiver.name },
      traceId: message.traceId,
      timestamp: Date.now(),
      ttl: 0,
    };
  }

  /** Handoff：把对话控制权转给另一个 Agent */
  async handoff(
    fromAgent: string,
    toAgent: string,
    context: { summary: string; userIntent: string },
    traceId: string
  ): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: `handoff-${Date.now()}`,
      from: fromAgent,
      to: toAgent,
      type: "handoff",
      payload: {
        reason: "当前 Agent 无法处理，转接给更合适的 Agent",
        context,
      },
      traceId,
      timestamp: Date.now(),
      ttl: 10000,
    };

    console.log(`   🔄 Handoff: ${fromAgent} → ${toAgent}`);
    console.log(`      摘要: ${context.summary.slice(0, 80)}...`);

    return this.sendAndWait(message);
  }

  private _errorReply(original: AgentMessage, error: string): AgentMessage {
    return {
      id: `error-${original.id}`,
      from: original.to,
      to: original.from,
      type: "error",
      payload: { error },
      traceId: original.traceId,
      timestamp: Date.now(),
      ttl: 0,
    };
  }
}

// ===== Demo =====

async function main() {
  console.log("\n🌐 Agent Mesh Demo\n");
  console.log("=".repeat(65));

  // 1. 注册 Agent
  console.log("\n📝 1. Agent 注册\n");

  const registry = new AgentRegistry();

  registry.register({
    id: "agent-code-gen",
    name: "代码生成专家",
    role: "code-generator",
    capabilities: [
      {
        name: "TypeScript 代码生成",
        description: "生成类型安全的 TypeScript 代码，含 React 组件和工具函数",
        keywords: ["typescript", "react", "code-generation", "frontend"],
      },
    ],
    maxConcurrency: 2,
    status: "idle",
  });

  registry.register({
    id: "agent-code-review",
    name: "代码审查专家",
    role: "code-reviewer",
    capabilities: [
      {
        name: "安全审查",
        description: "检测 XSS、SQL注入、敏感信息泄露等安全漏洞",
        keywords: ["security", "xss", "injection", "vulnerability"],
      },
      {
        name: "性能审查",
        description: "检测不必要的重渲染、内存泄漏、大循环等性能问题",
        keywords: ["performance", "rendering", "memory", "optimization"],
      },
    ],
    maxConcurrency: 1,
    status: "idle",
  });

  registry.register({
    id: "agent-test-writer",
    name: "测试专家",
    role: "test-writer",
    capabilities: [
      {
        name: "单元测试",
        description: "Vitest + React Testing Library 单元测试",
        keywords: ["test", "vitest", "unit-test", "coverage"],
      },
    ],
    maxConcurrency: 3,
    status: "idle",
  });

  console.log(`   已注册: ${registry.list().length} 个 Agent`);

  // 2. 语义路由演示
  console.log("\n🔍 2. 语义路由演示\n");

  const router = new MessageRouter(registry);

  const testQueries = [
    "帮我写一个 React 登录组件",
    "检查这段代码有没有 SQL 注入风险",
    "写 Vitest 单元测试",
    "优化组件渲染性能",
  ];

  for (const query of testQueries) {
    const match = await registry.findBestAgent(query);
    console.log(
      `   "${query}" → ${match?.agent.name} (score: ${match?.score.toFixed(3)})`
    );
  }

  // 3. 消息传递演示
  console.log("\n✉️ 3. 消息传递演示\n");

  const reply = await router.sendAndWait({
    id: "msg-001",
    from: "orchestrator",
    to: "agent-code-gen",
    type: "task",
    payload: { description: "写一个 formatDate 函数" },
    traceId: "trace-001",
    timestamp: Date.now(),
    ttl: 30000,
  });

  console.log(`   回复: ${JSON.stringify(reply.payload)}`);

  // 4. Handoff 演示
  console.log("\n🔄 4. Handoff 演示\n");

  await router.handoff(
    "agent-code-gen",
    "agent-code-review",
    {
      summary: "代码已生成，需要安全审查",
      userIntent: "确保代码没有安全漏洞",
    },
    "trace-001"
  );

  // 5. Agent 状态
  console.log("\n📊 5. Agent 状态\n");
  registry.list().forEach((a) => {
    const statusEmoji =
      a.status === "idle" ? "🟢" : a.status === "busy" ? "🟡" : "🔴";
    console.log(
      `   ${statusEmoji} ${a.name} (${a.id}) — 最大并发: ${a.maxConcurrency}`
    );
  });

  console.log("\n" + "=".repeat(65));
  console.log(
    "\n💡 Agent Mesh 是编排的基础设施：注册→路由→通信→Handoff\n"
  );
}

main().catch((err) => {
  console.error("❌ Mesh error:", err);
  process.exit(1);
});
