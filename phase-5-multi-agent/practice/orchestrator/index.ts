/**
 * Agent 编排引擎 — Orchestrator / Worker 模式
 *
 * 设计理念（对应 theory/01 §2）：
 *   Orchestrator 负责分解任务、分配 Worker、验证结果、汇总输出。
 *   Worker 只负责执行单一领域任务，不关心其他 Agent。
 *
 * 这是多 Agent 系统的核心——没有编排就没有协作。
 *
 * 运行：npm run orchestrator
 */

import { createLLMClient } from "../../../phase-3-prompt-eng/practice/api-client/index.js";

// ===== Types =====

interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  capabilities: string[];
  tools: string[];
}

interface Task {
  id: string;
  description: string;
  agentRole: string;
  dependsOn: string[];
  acceptanceCriteria: string[];
  estimatedComplexity: number; // 1-10
}

interface TaskResult {
  taskId: string;
  agentRole: string;
  status: "COMPLETED" | "FAILED" | "TIMEOUT";
  content: string;
  confidence: number;
  retries: number;
  latencyMs: number;
  failures?: string[];
}

interface OrchestrationTrace {
  traceId: string;
  tasks: Task[];
  results: Map<string, TaskResult>;
  totalLatencyMs: number;
  totalTokens: number;
  estimatedCost: number;
}

// ===== Agent Registry =====

const AGENT_REGISTRY: Record<string, AgentConfig> = {
  "code-generator": {
    name: "代码生成专家",
    role: "code-generator",
    systemPrompt: `你是 TypeScript + React 代码生成专家。规则：
1. 输出完整的可运行代码，含类型定义
2. 代码简洁、类型安全、无 any
3. 附带使用示例`,
    capabilities: ["typescript", "react", "nodejs"],
    tools: ["write_file", "search_code"],
  },
  "code-reviewer": {
    name: "代码审查专家",
    role: "code-reviewer",
    systemPrompt: `你是资深代码审查专家。审查标准：安全第一、性能第二、可维护性第三。
输出分为「🔴 严重问题」「🟡 改进建议」「🟢 做得好的地方」三部分。
每个问题附带具体行号和修复方案。`,
    capabilities: ["security", "performance", "typescript"],
    tools: ["read_file", "search_code"],
  },
  "test-writer": {
    name: "测试专家",
    role: "test-writer",
    systemPrompt: `你是测试专家。为给定代码编写完整的测试用例。
覆盖：正常路径、边界情况、错误处理、异步逻辑。
使用 Vitest + @testing-library/react。`,
    capabilities: ["unit-test", "integration-test", "vitest"],
    tools: ["write_file", "run_test"],
  },
  "synthesizer": {
    name: "汇总专家",
    role: "synthesizer",
    systemPrompt: `你是结果汇总专家。将多个 Agent 的输出合并为一份连贯的最终报告。
去重、合并相似建议、统一语言风格、标注每条建议的来源 Agent。`,
    capabilities: ["synthesis", "writing"],
    tools: [],
  },
};

// ===== Orchestrator =====

class AgentOrchestrator {
  private trace: OrchestrationTrace;
  private results: Map<string, TaskResult> = new Map();
  private apiClient = createLLMClient();

  constructor() {
    this.trace = {
      traceId: `trace-${Date.now()}`,
      tasks: [],
      results: this.results,
      totalLatencyMs: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };
  }

  /**
   * 核心方法：分解 → 调度 → 执行 → 验证 → 汇总
   */
  async execute(userRequest: string): Promise<{
    finalAnswer: string;
    trace: OrchestrationTrace;
  }> {
    console.log("\n🧠 Orchestrator 启动\n");
    console.log(`   TraceID: ${this.trace.traceId}`);
    console.log(`   Request: "${userRequest}"`);

    // Phase 1: 任务分解
    console.log("\n📋 Phase 1: 任务分解");
    const tasks = await this._decompose(userRequest);
    this.trace.tasks = tasks;
    tasks.forEach((t) =>
      console.log(
        `   └─ ${t.id}: ${t.description.slice(0, 60)}... → ${t.agentRole} (依赖: [${t.dependsOn.join(", ") || "无"}])`
      )
    );

    // Phase 2: 拓扑排序 + 调度
    console.log("\n⚡ Phase 2: 调度执行");
    const sorted = this._topologicalSort(tasks);
    console.log(`   执行顺序: ${sorted.map((t) => t.id).join(" → ")}`);

    // Phase 3: 执行（串行依赖 + 并行无依赖）
    await this._executeTasks(sorted);

    // Phase 4: 验证
    console.log("\n🔍 Phase 4: 结果验证");
    const passed = [...this.results.values()].filter(
      (r) => r.status === "COMPLETED"
    ).length;
    console.log(
      `   ${passed}/${tasks.length} 任务通过 (${((passed / tasks.length) * 100).toFixed(0)}%)`
    );

    // Phase 5: 汇总
    console.log("\n📊 Phase 5: Synthesizer 汇总");
    const finalAnswer = await this._synthesize(userRequest);

    this.trace.totalLatencyMs = [...this.results.values()].reduce(
      (s, r) => s + r.latencyMs,
      0
    );

    return { finalAnswer, trace: this.trace };
  }

  // ===== Private Methods =====

  /** 用 LLM 将用户请求分解为子任务 */
  private async _decompose(userRequest: string): Promise<Task[]> {
    const llm = this.apiClient;
    const result = await llm.chat([
      {
        role: "system",
        content: `你是任务分解专家。将用户请求分解为 2-4 个可独立执行的子任务。
可用 Agent 角色：${Object.keys(AGENT_REGISTRY).join(", ")}。

规则：
1. 每个子任务必须有明确的验收标准
2. 标注依赖关系（如果任务 B 需要任务 A 的输出，则 B 依赖 A）
3. 可以并行的任务不要设置依赖
4. 输出 JSON 数组

输出格式：
[{
  "id": "task-1",
  "description": "...",
  "agentRole": "code-generator",
  "dependsOn": [],
  "acceptanceCriteria": ["...", "..."],
  "estimatedComplexity": 5
}]`,
      },
      { role: "user", content: userRequest },
    ]);

    try {
      const json = JSON.parse(
        result.content.match(/\[[\s\S]*\]/)?.[0] || "[]"
      );
      return json.map((t: any, i: number) => ({
        id: t.id || `task-${i + 1}`,
        description: t.description,
        agentRole: t.agentRole,
        dependsOn: t.dependsOn || [],
        acceptanceCriteria: t.acceptanceCriteria || [],
        estimatedComplexity: t.estimatedComplexity || 5,
      }));
    } catch {
      // Fallback: 手动分解
      return [
        {
          id: "task-1",
          description: userRequest,
          agentRole: "code-generator",
          dependsOn: [],
          acceptanceCriteria: ["输出符合要求的代码"],
          estimatedComplexity: 5,
        },
      ];
    }
  }

  /** 拓扑排序：保证依赖任务先执行 */
  private _topologicalSort(tasks: Task[]): Task[] {
    const sorted: Task[] = [];
    const visited = new Set<string>();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    function visit(task: Task) {
      if (visited.has(task.id)) return;
      visited.add(task.id);
      for (const depId of task.dependsOn) {
        const dep = taskMap.get(depId);
        if (dep) visit(dep);
      }
      sorted.push(task);
    }

    for (const task of tasks) visit(task);
    return sorted;
  }

  /** 执行所有任务（处理依赖和并行） */
  private async _executeTasks(sorted: Task[]): Promise<void> {
    for (const task of sorted) {
      // 检查依赖是否都已完成
      const depsFailed = task.dependsOn.some((depId) => {
        const res = this.results.get(depId);
        return !res || res.status !== "COMPLETED";
      });

      if (depsFailed) {
        console.log(`   ⊘ ${task.id}: 依赖失败，跳过`);
        this.results.set(task.id, {
          taskId: task.id,
          agentRole: task.agentRole,
          status: "FAILED",
          content: "",
          confidence: 0,
          retries: 0,
          latencyMs: 0,
          failures: ["依赖任务失败"],
        });
        continue;
      }

      await this._executeSingleTask(task);
    }
  }

  /** 执行单个任务（含重试逻辑） */
  private async _executeSingleTask(
    task: Task,
    maxRetries: number = 2
  ): Promise<void> {
    const agent = AGENT_REGISTRY[task.agentRole];
    if (!agent) {
      console.log(`   ❌ ${task.id}: 未找到 Agent "${task.agentRole}"`);
      return;
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const start = Date.now();

      try {
        // 构建 Agent prompt
        const context =
          attempt > 0
            ? `\n[重试 ${attempt}] 上次失败原因: ${JSON.stringify(this.results.get(task.id)?.failures)}`
            : "";

        const llm = this.apiClient;
        const result = await llm.chat([
          { role: "system", content: agent.systemPrompt + context },
          {
            role: "user",
            content: `任务: ${task.description}\n\n验收标准:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`,
          },
        ]);

        // 验证输出
        const failures = this._validate(result.content, task.acceptanceCriteria);
        const latencyMs = Date.now() - start;

        if (failures.length === 0) {
          console.log(
            `   ✅ ${task.id} (${agent.name}): ${latencyMs}ms${attempt > 0 ? ` (重试${attempt}次后通过)` : ""}`
          );
          this.results.set(task.id, {
            taskId: task.id,
            agentRole: task.agentRole,
            status: "COMPLETED",
            content: result.content,
            confidence: 0.9,
            retries: attempt,
            latencyMs,
          });
          return;
        }

        // 有失败但还有重试机会
        if (attempt < maxRetries) {
          console.log(
            `   ⚠️ ${task.id}: 尝试 ${attempt + 1}/${maxRetries + 1} 失败, 重试中...`
          );
          this.results.set(task.id, {
            taskId: task.id,
            agentRole: task.agentRole,
            status: "FAILED",
            content: result.content,
            confidence: 0.5,
            retries: attempt,
            latencyMs,
            failures,
          });
        } else {
          console.log(
            `   ❌ ${task.id}: ${maxRetries + 1} 次尝试全部失败`
          );
          this.results.set(task.id, {
            taskId: task.id,
            agentRole: task.agentRole,
            status: "FAILED",
            content: result.content,
            confidence: 0.3,
            retries: attempt,
            latencyMs,
            failures,
          });
        }
      } catch (err: any) {
        console.log(`   💥 ${task.id}: ${err.message}`);
        this.results.set(task.id, {
          taskId: task.id,
          agentRole: task.agentRole,
          status: "FAILED",
          content: "",
          confidence: 0,
          retries: attempt,
          latencyMs: Date.now() - start,
          failures: [err.message],
        });
        break;
      }
    }
  }

  /** 验证 Agent 输出是否符合验收标准 */
  private _validate(output: string, criteria: string[]): string[] {
    const failures: string[] = [];
    for (const c of criteria) {
      // 简单规则验证（生产环境可用 LLM-as-Judge）
      if (c.includes("JSON") && !this._isValidJSON(output)) {
        failures.push("输出不是合法 JSON");
      }
      if (c.includes("TypeScript") && !output.includes("typescript")) {
        failures.push("输出未提及 TypeScript");
      }
    }
    return failures;
  }

  /** Synthesizer 汇总所有 Agent 结果 */
  private async _synthesize(userRequest: string): Promise<string> {
    const completedResults = [...this.results.values()]
      .filter((r) => r.status === "COMPLETED")
      .map((r) => `[${r.agentRole}]\n${r.content}`)
      .join("\n\n---\n\n");

    if (!completedResults) return "所有 Agent 执行失败，无法生成结果。";

    const llm = this.apiClient;
    const result = await llm.chat([
      {
        role: "system",
        content: AGENT_REGISTRY["synthesizer"].systemPrompt,
      },
      {
        role: "user",
        content: `用户请求: ${userRequest}\n\n各 Agent 输出:\n${completedResults}\n\n请汇总为一份连贯的最终报告。`,
      },
    ]);

    return result.content;
  }

  private _isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
}

// ===== Demo =====

async function main() {
  console.log("\n🤖 Multi-Agent Orchestrator Demo\n");
  console.log("=".repeat(65));

  const orchestrator = new AgentOrchestrator();

  const result = await orchestrator.execute(
    "帮我写一个 TypeScript 工具函数 formatDate，接受 Date 和格式字符串，返回格式化后的日期字符串。然后审查这段代码，最后写测试用例。"
  );

  console.log("\n" + "=".repeat(65));
  console.log("\n📊 执行报告\n");
  console.log(`   任务数: ${result.trace.tasks.length}`);
  console.log(
    `   通过: ${[...result.trace.results.values()].filter((r) => r.status === "COMPLETED").length}`
  );
  console.log(
    `   失败: ${[...result.trace.results.values()].filter((r) => r.status === "FAILED").length}`
  );
  console.log(`   总耗时: ${result.trace.totalLatencyMs}ms`);
  console.log(`\n─── 最终输出 ───\n`);
  console.log(result.finalAnswer.slice(0, 500));
  if (result.finalAnswer.length > 500)
    console.log("   ...(truncated)");

  console.log("\n" + "=".repeat(65));
  console.log(
    "\n💡 这个 Demo 展示了多 Agent 编排的核心：分解→调度→执行→验证→汇总\n"
  );
}

main().catch((err) => {
  console.error("❌ Orchestrator error:", err);
  process.exit(1);
});
